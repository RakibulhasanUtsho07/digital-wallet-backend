"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EKYCProviderFactory = void 0;
const MockECProvider_js_1 = require("./MockECProvider.js");
const RealECEKYCProvider_js_1 = require("./RealECEKYCProvider.js");
class EKYCProviderFactory {
    dynamicConfig;
    constructor(dynamicConfig) {
        this.dynamicConfig = dynamicConfig;
    }
    async create() {
        const config = await this.dynamicConfig.get();
        return config.useMockProvider
            ? new MockECProvider_js_1.MockECProvider(config.mockLatencyMs)
            : new RealECEKYCProvider_js_1.RealECEKYCProvider(config.provider);
    }
}
exports.EKYCProviderFactory = EKYCProviderFactory;
