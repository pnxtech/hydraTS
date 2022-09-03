export interface IHydraConfig {
  serviceName: string;
  serviceDescription: string;
  serviceIP: string;
  servicePort: number;
  serviceType: string;
  serviceVersion: string;
  redis: {
    url: string;
  }
}

