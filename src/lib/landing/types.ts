/**
 * Landing Page CMS — Type Definitions
 */

export interface HeroContent {
    badge: string;
    headingLine1: string;
    headingHighlight: string;
    sub: string;
    ctaText: string;
}

export interface MetricItem {
    value: string;
    label: string;
}

export interface FeatureItem {
    title: string;
    desc: string;
}

export interface FeaturesContent {
    sectionLabel: string;
    sectionTitle: string;
    sectionDesc: string;
    items: FeatureItem[];
}

export interface HowItWorksStep {
    step: string;
    title: string;
    desc: string;
}

export interface HowItWorksContent {
    sectionLabel: string;
    sectionTitle: string;
    items: HowItWorksStep[];
}

export interface SocialProofCard {
    category: string;
    stat: string;
    statSuffix: string;
    result: string;
}

export interface SocialProofContent {
    sectionLabel: string;
    sectionTitle: string;
    items: SocialProofCard[];
}

export interface PlanPricing {
    monthly: { price: string; period: string; savings?: string };
    yearly: { price: string; period: string; savings?: string };
}

export interface PricingContent {
    sectionLabel: string;
    sectionTitle: string;
    starter: PlanPricing & { label: string; desc: string; features: string[] };
    pro: PlanPricing & { label: string; desc: string; features: string[]; recommended?: boolean };
    enterprise: PlanPricing & { label: string; desc: string; features: string[] };
}

export interface ComparisonRow {
    name: string;
    starter: string | boolean;
    pro: string | boolean;
    enterprise: string | boolean;
}

export interface FaqItem {
    q: string;
    a: string;
}

export interface FaqContent {
    sectionLabel: string;
    sectionTitle: string;
    items: FaqItem[];
}

export interface CtaContent {
    heading: string;
    sub: string;
    buttonText: string;
    linkText: string;
}

export interface LandingContent {
    hero: HeroContent;
    metrics: MetricItem[];
    features: FeaturesContent;
    how_it_works: HowItWorksContent;
    social_proof: SocialProofContent;
    pricing: PricingContent;
    comparison: ComparisonRow[];
    faq: FaqContent;
    cta: CtaContent;
}
