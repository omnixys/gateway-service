import { env } from './env.js';
import { nodeConfig } from './node.js';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { getLogger } from '@omnixys/logger-ts';
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
      this.#logger.info(chalk.cyan('Log Directory ') + chalk.yellow(logger.logDir));
      this.#logger.info(chalk.cyan('Log Filename: ') + chalk.yellow(logger.logFileName));
      this.#logger.info(chalk.cyan('Pretty Logging: ') + chalk.yellow(logger.logPretty));
      this.#logger.info(chalk.cyan('Custom Log Level: ') + chalk.yellow(logger.logLevel));
    }
    this.#printEnv(nodeEnv);
    this.#logger.info(chalk.green('==============================='));
  }

  #printEnv(nodeEnv: string): void {
    const groups = new Map<string, Array<[string, string]>>();
    const order = [
      'LOGGER',
      'KEYCLOAK',
      'HEALTH',
      'KAFKA',
      'CACHE',
      'STORAGE',
      'GRPC',
      'GEOCODING',
      'DATABASE',
      'SUBGRAPHS',
      'OBSERVABILITY',
      'GENERAL',
    ];
    for (const s of order) {
      groups.set(s, []);
    }

    for (const [key, value] of Object.entries(env)) {
      if (
        key.startsWith('LOG_') ||
        ['NODE_ENV', 'PORT', 'SERVICE', 'HTTPS', 'KEYS_PATH'].includes(key)
      ) {
        continue;
      }
      const section = this.#sectionFor(key);
      groups.get(section)?.push([key, String(value)]);
    }

    for (const section of order) {
      const entries = groups.get(section)!;
      if (entries.length === 0) {
        continue;
      }
      this.#logger.info(chalk.green(`==============${section}===========`));
      for (const [key, value] of entries) {
        this.#logger.info(
          chalk.cyan(`${key}: `) + chalk.yellow(this.#displayValue(key, value, nodeEnv)),
        );
      }
    }
  }

  #sectionFor(key: string): string {
    if (key.startsWith('KC_') || key.startsWith('KEYCLOAK_')) {
      return 'KEYCLOAK';
    }
    if (key.startsWith('HEALTH_')) {
      return 'HEALTH';
    }
    if (key.startsWith('KAFKA_')) {
      return 'KAFKA';
    }
    if (key.startsWith('VALKEY_') || key.startsWith('RATE_LIMIT_')) {
      return 'CACHE';
    }
    if (key.startsWith('STORAGE_')) {
      return 'STORAGE';
    }
    if (key.includes('GRPC')) {
      return 'GRPC';
    }
    if (key.startsWith('GEOCODING_')) {
      return 'GEOCODING';
    }
    if (key === 'DATABASE_URL') {
      return 'DATABASE';
    }
    if (
      key.startsWith('ANALYTICS_') ||
      key.startsWith('AUTHENTICATION_') ||
      key.startsWith('EVENT_') ||
      key.startsWith('INVITATION_') ||
      key.startsWith('TICKET_') ||
      key.startsWith('NOTIFICATION_') ||
      key.startsWith('USER_') ||
      key.startsWith('SEAT_') ||
      key.startsWith('ADDRESS_') ||
      key.startsWith('CHAT_') ||
      key.startsWith('COMMUNICATION_GATEWAY_') ||
      key.startsWith('SUPERGRAPH_')
    ) {
      return 'SUBGRAPHS';
    }
    if (key.startsWith('OTEL_') || key.startsWith('TEMPO_') || key.startsWith('PROMETHEUS_')) {
      return 'OBSERVABILITY';
    }
    return 'GENERAL';
  }

  #displayValue(_key: string, value: string, nodeEnv: string): string {
    if (nodeEnv !== 'development' && this.#isSensitiveKey(_key)) {
      return '****';
    }
    return value;
  }

  #isSensitiveKey(key: string): boolean {
    return /SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY|ENCRYPTION_KEY|JWE_KEY|JWS_KEYS|HMAC_SECRET|FINGERPRINT_SECRET|DATABASE_URL|CLIENT_SECRET/.test(
      key,
    );
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
