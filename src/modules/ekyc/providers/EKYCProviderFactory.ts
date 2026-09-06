import type { DynamicEKYCConfig } from "../config/ekycConfig.js";
import type { IEKYCProvider } from "../types.js";
import { MockECProvider } from "./MockECProvider.js";
import { RealECEKYCProvider } from "./RealECEKYCProvider.js";

export class EKYCProviderFactory {
  constructor(private readonly dynamicConfig: DynamicEKYCConfig) {}

  async create(): Promise<IEKYCProvider> {
    const config = await this.dynamicConfig.get();
    return config.useMockProvider
      ? new MockECProvider(config.mockLatencyMs)
      : new RealECEKYCProvider(config.provider);
  }
}
