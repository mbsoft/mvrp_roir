import fs from 'fs-extra';
import path from 'path';
import Logger from './logger.js';

class FileUtils {
  static async readJsonFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      Logger.error(`Failed to read JSON file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  static async writeJsonFile(filePath, data) {
    try {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      Logger.debug(`Successfully wrote JSON file: ${filePath}`);
    } catch (error) {
      Logger.error(`Failed to write JSON file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  static async ensureDirectory(dirPath) {
    try {
      await fs.ensureDir(dirPath);
      Logger.debug(`Ensured directory exists: ${dirPath}`);
    } catch (error) {
      Logger.error(`Failed to create directory ${dirPath}: ${error.message}`);
      throw error;
    }
  }

  static async fileExists(filePath) {
    try {
      return await fs.pathExists(filePath);
    } catch (error) {
      Logger.error(`Failed to check file existence ${filePath}: ${error.message}`);
      return false;
    }
  }

  static async copyFile(source, destination) {
    try {
      await fs.copy(source, destination);
      Logger.debug(`Copied file from ${source} to ${destination}`);
    } catch (error) {
      Logger.error(`Failed to copy file from ${source} to ${destination}: ${error.message}`);
      throw error;
    }
  }

  static async createBackup(filePath, suffix = '.backup') {
    try {
      const backupPath = `${filePath}${suffix}`;
      await this.copyFile(filePath, backupPath);
      return backupPath;
    } catch (error) {
      Logger.error(`Failed to create backup of ${filePath}: ${error.message}`);
      throw error;
    }
  }
}

export default FileUtils; 