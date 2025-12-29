const fs = require('fs').promises;
const path = require('path');
const { WriteError, ReadError } = require('../utils/errors');

class BackupManager {
  /**
   * Create backup manager
   * @param {DatabaseConnection} db Database instance
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Create backup of database
   * @param {string} backupPath Path to backup file
   * @returns {Promise<Object>} Backup metadata
   */
  async createBackup(backupPath) {
    try {
      const resolvedPath = path.resolve(backupPath);
      const data = await this.db.readData();
      
      const backup = {
        version: '6.1.0',
        timestamp: new Date().toISOString(),
        entries: Object.keys(data).length,
        data: data
      };

      await fs.writeFile(
        resolvedPath,
        JSON.stringify(backup, null, 2),
        { mode: 0o600 }
      );

      return {
        path: resolvedPath,
        entries: backup.entries,
        timestamp: backup.timestamp,
        size: (await fs.stat(resolvedPath)).size
      };
    } catch (error) {
      throw new WriteError(`Backup failed: ${error.message}`);
    }
  }

  /**
   * Restore database from backup
   * @param {string} backupPath Path to backup file
   * @param {Object} options Restore options
   * @param {boolean} [options.merge=false] Merge with existing data
   * @returns {Promise<Object>} Restore metadata
   */
  async restore(backupPath, options = {}) {
    try {
      const resolvedPath = path.resolve(backupPath);
      const content = await fs.readFile(resolvedPath, 'utf8');
      const backup = JSON.parse(content);

      if (!backup.data || !backup.version) {
        throw new Error('Invalid backup file format');
      }

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
            console.warn(`[QuantumDB] Invalid backup file: ${file}`);
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
