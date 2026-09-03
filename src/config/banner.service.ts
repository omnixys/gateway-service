import { env } from './env.js';
import { nodeConfig } from './node.js';

import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import {
  displayLogEnvValue,
  getLogger,
  getLogEnvSection,
  LOG_ENV_SECTION_ORDER,
  type LogEnvSection,
} from '@omnixys/logger-ts';

import cFonts from 'cfonts';
import chalk from 'chalk';

import { release, type, userInfo } from 'node:os';

import process from 'node:process';

@Injectable()
export class BannerService implements OnApplicationBootstrap {
  readonly #logger = getLogger(BannerService.name);

  onApplicationBootstrap(): void {
    const { host, nodeEnv, port, protocoll, keysPath, logger, serviceName } = nodeConfig;

    this.#generateBanner(serviceName);

    this.#logger.info(chalk.green('=== Anwendungsinformationen ==='));

    this.#logger.info(chalk.cyan('Anwendungsname: ') + chalk.yellow(serviceName));

    this.#logger.info(chalk.cyan('Node.js-Version: ') + chalk.yellow(process.version));

    this.#logger.info(chalk.cyan('Umgebung: ') + chalk.yellow(nodeEnv));

    this.#logger.info(chalk.cyan('Host: ') + chalk.yellow(host));

    this.#logger.info(chalk.cyan('Port: ') + chalk.yellow(port.toString()));

    this.#logger.info(chalk.cyan('Betriebssystem: ') + chalk.yellow(`${type()} (${release()})`));

    this.#logger.info(chalk.cyan('Benutzer: ') + chalk.yellow(userInfo().username));

    this.#logger.info(chalk.cyan('HTTPS: ') + chalk.yellow(protocoll));

    this.#logger.info(chalk.cyan('Keys path: ') + chalk.yellow(keysPath));

    this.#logger.info(chalk.green('===============LOGGER============'));

    if (logger.logDefault) {
      this.#logger.info(chalk.cyan('Default Logger!'));
    } else {
      this.#logger.info(chalk.cyan('Log Directory: ') + chalk.yellow(logger.logDir));

      this.#logger.info(chalk.cyan('Log Filename: ') + chalk.yellow(logger.logFileName));

      this.#logger.info(chalk.cyan('Pretty Logging: ') + chalk.yellow(String(logger.logPretty)));

      this.#logger.info(chalk.cyan('Custom Log Level: ') + chalk.yellow(logger.logLevel));
    }

    this.#printEnv();

    this.#logger.info(chalk.green('==============================='));
  }

  #printEnv(): void {
    const groups = new Map<LogEnvSection, Array<[string, string]>>();

    for (const section of LOG_ENV_SECTION_ORDER) {
      groups.set(section, []);
    }

    for (const [key, value] of Object.entries(env)) {
      if (
        key.startsWith('LOG_') ||
        ['NODE_ENV', 'PORT', 'SERVICE', 'HTTPS', 'KEYS_PATH'].includes(key)
      ) {
        continue;
      }

      const section = getLogEnvSection(key);

      groups.get(section)?.push([key, String(value)]);
    }

    for (const section of LOG_ENV_SECTION_ORDER) {
      const entries = groups.get(section);

      if (entries === undefined || entries.length === 0) {
        continue;
      }

      this.#logger.info(chalk.green(`==============${section}===========`));

      for (const [key, value] of entries) {
        this.#logger.info(
          chalk.cyan(`${key}: `) +
            chalk.yellow(
              displayLogEnvValue(key, value, {
                nodeEnv: nodeConfig.nodeEnv,
              }),
            ),
        );
      }
    }
  }

  #generateBanner(serviceName: string): void {
    cFonts.say(serviceName, {
      font: 'block',
      align: 'left',
      gradient: ['white', 'black'],
      background: 'transparent',
      letterSpacing: 1,
      lineHeight: 1,
    });
  }
}
