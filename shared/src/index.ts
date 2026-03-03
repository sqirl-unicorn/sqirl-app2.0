/**
 * @sqirl/shared — barrel export.
 * All platforms import types and the API factory from here.
 */

export * from './types';
export { createApiClient } from './createApiClient';
export type { ApiClient } from './createApiClient';
export { LOYALTY_BRANDS, getBrandsForCountry, getBrandById } from './loyaltyBrands';
export type { LoyaltyBrand } from './loyaltyBrands';
export { GIFT_BRANDS, getGiftBrandsForCountry, getGiftBrandById } from './giftBrands';
export type { GiftBrand } from './giftBrands';
