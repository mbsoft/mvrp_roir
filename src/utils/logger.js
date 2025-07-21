import chalk from 'chalk';

class Logger {
  static info(message) {
    console.log(chalk.blue(`[INFO] ${message}`));
  }

  static success(message) {
    console.log(chalk.green(`[SUCCESS] ${message}`));
  }

  static warning(message) {
    console.log(chalk.yellow(`[WARNING] ${message}`));
  }

  static error(message) {
    console.log(chalk.red(`[ERROR] ${message}`));
  }

  static debug(message) {
    if (process.env.DEBUG) {
      console.log(chalk.gray(`[DEBUG] ${message}`));
    }
  }

  static progress(message) {
    console.log(chalk.cyan(`[PROGRESS] ${message}`));
  }
}

export default Logger; 