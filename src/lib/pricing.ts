export const INTERNAL_PRODUCT_PRICING = {
  shirts: 40,
  hoodies: 65,
  jackets: 65,
  hats: 30,
  tumblers: 28,
  mugs: 22,
  accessories: 20,
} as const;

export type InternalProductPricingKey = keyof typeof INTERNAL_PRODUCT_PRICING;
