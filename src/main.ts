import EventEmitter from 'events';
import { createClient } from 'redis';
import { IHydraConfig } from './lib/hydra-config';
import { Network } from './lib/network';

/**
 * Hydra class
 */
export class Hydra extends EventEmitter { 
  private client;
  private config: IHydraConfig;

  /**
   * @name constructor
   */
  constructor() {
    super();
  }

  /**
   * @name init
   * @summary Initialize Hydra
   * @param config IHydraConfig 
   */
  async init(config: IHydraConfig) {
    this.config = config;
    this.client = createClient({
      url: this.config.redis.url
    });
    this.client.on('error', (err) => console.log('Redis Client Error', err));
    await this.client.connect();

    // const s = await this.client.get('hydra:service:hydra-logging-svcs:service');
    // console.log(s);
    const net = new Network();
    this.config.serviceIP = await net.getServiceIP(this.config);
    console.log(this.config.serviceIP);
  }
}
