import { Hydra } from './main';
import config from './config/config.json';

const main = async () => {
  const hydra = new Hydra();
  await hydra.init(config.hydra);
};

main()
