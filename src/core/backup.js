const fs = require('fs').promises;
const path = require('path');
const { WriteError, ReadError } = require('../utils/errors');
const { defaultLogger } = require('../utils/logger');
const { version } = require('../../package.json');

class BackupManager {
  /**
   * Create backup manager
   * @param {DatabaseConnection} db Database instance
   */
  constructor(db) {
    this.db = db;
  }

  async createBackup(backupPath) {
    let writeStream = null;
    try {
      const resolvedPath = path.resolve(backupPath);
      const backupDir = path.dirname(resolvedPath);
      
      await fs.mkdir(backupDir, { recursive: true });
      
      writeStream = require('fs').createWriteStream(resolvedPath);
      
      const metadata = {
        version,
        timestamp: new Date().toISOString(),
        entries: 0
      };
      
      writeStream.write('{\n');
      writeStream.write(`  "version": "${metadata.version}",\n`);
      writeStream.write(`  "timestamp": "${metadata.timestamp}",\n`);
      writeStream.write('  "data": {\n');
      
      let isFirst = true;
      for await (const { key, value } of this.db.streamEntries()) {
        if (!isFirst) {
          writeStream.write(',\n');
        }
        writeStream.write(`    ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
        metadata.entries++;
        isFirst = false;
      }
      
      writeStream.write('\n  },\n');
      writeStream.write(`  "entries": ${metadata.entries}\n`);
      writeStream.write('}\n');
      
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });

      await this.setBackupPermissionsSafe(resolvedPath);

      const stats = await fs.stat(resolvedPath);
      
      return {
        path: resolvedPath,
        entries: metadata.entries,
        timestamp: metadata.timestamp,
        size: stats.size
      };
    } catch (error) {
      if (writeStream) {
        writeStream.destroy();
      }
      throw new WriteError(`Backup failed: ${error.message}`);
    }
  }

  async setBackupPermissionsSafe(filePath) {
    if (process.platform === 'win32') {
      return;
    }
    
    try {
      await require('fs').promises.chmod(filePath, 0o600);
    } catch (error) {
      defaultLogger.warn(`Could not set backup file permissions (non-fatal): ${error.message}`);
    }
  }

  async restore(backupPath, options = {}) {
    const timeout = options.timeout || 300000;
    
    const restorePromise = this.performRestore(backupPath, options);
    
    if (timeout > 0) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new ReadError(`Restore operation timed out after ${timeout}ms`));
        }, timeout);
      });
      
      return Promise.race([restorePromise, timeoutPromise]);
    }
    
    return restorePromise;
  }

  async performRestore(backupPath, options) {
    try {
      const resolvedPath = path.resolve(backupPath);
      const stats = await fs.stat(resolvedPath);
      const maxDirectLoadMb = 100;
      
      if (stats.size > maxDirectLoadMb * 1024 * 1024) {
        return await this.restoreStreaming(resolvedPath, options);
      }
      
      const content = await fs.readFile(resolvedPath, 'utf8');
      const backup = JSON.parse(content);

      this.validateBackupFormat(backup);
      
      let dataToRestore = backup.data;

      if (options.merge) {
        const existingData = await this.db.readData();
        dataToRestore = { ...existingData, ...backup.data };
      }

      await this.db.writeData(dataToRestore);

      return {
        entries: Object.keys(dataToRestore).length,
        backupVersion: backup.version,
        backupTimestamp: backup.timestamp,
        merged: options.merge || false
      };
    } catch (error) {
      throw new ReadError(`Restore failed: ${error.message}`);
    }
  }

  async restoreStreaming(backupPath, options) {
    const { createReadStream } = require('fs');
    const { pipeline } = require('stream/promises');
    
    return new Promise((resolve, reject) => {
      let buffer = '';
      let inData = false;
      const entries = [];
      const stream = createReadStream(backupPath, { encoding: 'utf8' });
      
      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (const line of lines) {
          if (line.includes('"data":')) {
            inData = true;
            continue;
          }
          if (inData && line.trim().startsWith('"')) {
            try {
              const match = line.match(/"([^"]+)":\s*(.+),?$/);
              if (match) {
                const [, key, valueStr] = match;
                const value = JSON.parse(valueStr.replace(/,$/, ''));
                entries.push({ key, value });
              }
            } catch (e) {
              defaultLogger.warn(`Failed to parse line: ${e.message}`);
            }
          }
        }
      });
      
      stream.on('end', async () => {
        try {
          let dataToRestore = {};
          entries.forEach(({ key, value }) => {
            dataToRestore[key] = value;
          });
          
          if (options.merge) {
            const existingData = await this.db.readData();
            dataToRestore = { ...existingData, ...dataToRestore };
          }
          
          await this.db.writeData(dataToRestore);
          
          resolve({
            entries: Object.keys(dataToRestore).length,
            backupVersion: 'streaming',
            backupTimestamp: new Date().toISOString(),
            merged: options.merge || false
          });
        } catch (error) {
          reject(error);
        }
      });
      
      stream.on('error', reject);
    });
  }

  validateBackupFormat(backup) {
    if (!backup.data || !backup.version) {
      throw new Error('Invalid backup file format: missing data or version fields');
    }
    
    if (!/^\d+\.\d+\.\d+/.test(backup.version)) {
      throw new Error(`Invalid version format: ${backup.version}`);
    }
    
    if (!backup.timestamp || isNaN(Date.parse(backup.timestamp))) {
      throw new Error(`Invalid timestamp format: ${backup.timestamp}`);
    }
    
    if (typeof backup.data !== 'object' || Array.isArray(backup.data)) {
      throw new Error('Backup data must be an object');
    }
    
    if (backup.entries !== undefined && typeof backup.entries !== 'number') {
      throw new Error(`Invalid entries count: ${backup.entries}`);
    }
    
    const expectedEntries = Object.keys(backup.data).length;
    if (backup.entries !== undefined && backup.entries !== expectedEntries) {
      throw new Error(`Entries mismatch: expected ${backup.entries}, found ${expectedEntries}`);
    }
    
    for (const [key, value] of Object.entries(backup.data)) {
      if (typeof key !== 'string' || !key) {
        throw new Error(`Invalid key in backup: ${key}`);
      }
      if (value === undefined) {
        throw new Error(`Invalid value for key "${key}" in backup`);
      }
    }
  }

  /**
   * List available backups in directory
   * @param {string} backupDir Directory containing backups
   * @returns {Promise<Array>} List of backup metadata
   */
  async listBackups(backupDir) {
    try {
      const resolvedDir = path.resolve(backupDir);
      const files = await fs.readdir(resolvedDir);
      const backups = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(resolvedDir, file);
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const backup = JSON.parse(content);
            
            if (backup.version && backup.timestamp) {
              const stats = await fs.stat(filePath);
              backups.push({
                file: file,
                path: filePath,
                version: backup.version,
                timestamp: backup.timestamp,
                entries: backup.entries,
                size: stats.size
              });
            }
          } catch (error) {
            defaultLogger.warn(`Invalid backup file: ${file}`);
            continue;
          }
        }
      }

      return backups.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
    } catch (error) {
      throw new ReadError(`List backups failed: ${error.message}`);
    }
  }
}

module.exports = BackupManager;
