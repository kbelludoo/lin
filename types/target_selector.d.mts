export declare const PROFILES: {
    PERFORMANCE: string;
    AI_DATA: string;
    WEB_EDGE: string;
    ENTERPRISE: string;
    FUNCTIONAL: string;
    CONFIG_INFRA: string;
    SMALLEST_SIZE: string;
};
/**
 * Score each language based on emitted code metrics and chosen profile.
 */
export declare function evaluateTargets(liaCode: any, profile?: string, opts?: {}): {
    profile: string;
    recommendedTarget: any;
    evaluations: any[];
};
