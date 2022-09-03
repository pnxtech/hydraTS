import EventEmitter from 'events';
import os from 'os';
import uuid from 'uuid';
import { createClient } from 'redis';
import { IHydraConfig } from './lib/hydra-config';

/**
 * Hydra class
 */
export class Hydra extends EventEmitter { 
  private client;

  /**
   * @name init
   * @summary Initialize Hydra
   * @param config IHydraConfig 
   */
  async init(config: IHydraConfig) {
    this.client = createClient({
      url: config.redis.url
    });
    this.client.on('error', (err) => console.log('Redis Client Error', err));
    await this.client.connect();

    const s = await this.client.get('hydra:service:hydra-logging-svcs:service');
    console.log(s);
  }
}

