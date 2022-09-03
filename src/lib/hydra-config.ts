export interface IHydraConfig {
  serviceName: string;
  serviceDescription: string;
  serviceIP: string;
  serviceDNS: string;
  serviceInterface: string;
  servicePort: number;
  serviceType: string;
  serviceVersion: string;
  redis: {
    url: string;
  }
}

