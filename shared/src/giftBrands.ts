/**
 * Gift Card Brand Catalog — shared across all platforms.
 *
 * Contains 120+ popular retailers issuing gift cards for AU, CA, US, UK, and EU.
 * Each brand includes:
 *   id              — unique slug used as the brandId in the DB
 *   name            — display name
 *   logoUrl         — Google Favicon Service (no auth, works offline via cache)
 *   barcodeFormat   — the default encoding used on the physical/digital card
 *   countries       — ISO 3166-1 alpha-2 codes where the brand operates
 *   requiresPin     — whether a PIN is typically required to use this card
 *   requiresExpiry  — whether the card carries an expiry date
 *
 * requiresPin and requiresExpiry drive mandatory-field rules in the UI.
 * Amazon gift cards, for example, have no PIN; most others do.
 */

import type { BarcodeFormat } from './types';

export interface GiftBrand {
  id: string;
  name: string;
  logoUrl: string;
  barcodeFormat: BarcodeFormat;
  countries: string[];
  requiresPin: boolean;
  requiresExpiry: boolean;
}

/** Helper: build Google Favicon Service URL at 64px */
function logo(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

export const GIFT_BRANDS: GiftBrand[] = [

  // ── Australia ────────────────────────────────────────────────────────────────

  { id: 'amazon-au',          name: 'Amazon',               logoUrl: logo('amazon.com.au'),         barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: false, requiresExpiry: false },
  { id: 'woolworths-gc-au',   name: 'Woolworths',           logoUrl: logo('woolworths.com.au'),     barcodeFormat: 'EAN13',   countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'coles-gc-au',        name: 'Coles',                logoUrl: logo('coles.com.au'),          barcodeFormat: 'EAN13',   countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'jbhifi-gc-au',       name: 'JB Hi-Fi',             logoUrl: logo('jbhifi.com.au'),         barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'harvey-norman-gc',   name: 'Harvey Norman',        logoUrl: logo('harveynorman.com.au'),   barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'bigw-gc-au',         name: 'Big W',                logoUrl: logo('bigw.com.au'),           barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'myer-gc-au',         name: 'Myer',                 logoUrl: logo('myer.com.au'),           barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'david-jones-gc',     name: 'David Jones',          logoUrl: logo('davidjones.com'),        barcodeFormat: 'QR',      countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'kmart-gc-au',        name: 'Kmart',                logoUrl: logo('kmart.com.au'),          barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'target-gc-au',       name: 'Target Australia',     logoUrl: logo('target.com.au'),         barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'bunnings-gc',        name: 'Bunnings',             logoUrl: logo('bunnings.com.au'),       barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'officeworks-gc',     name: 'Officeworks',          logoUrl: logo('officeworks.com.au'),    barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'chemist-wh-gc',      name: 'Chemist Warehouse',   logoUrl: logo('chemistwarehouse.com.au'),barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'eb-games-gc-au',     name: 'EB Games',             logoUrl: logo('ebgames.com.au'),        barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'itunes-gc-au',       name: 'Apple / iTunes',       logoUrl: logo('apple.com'),             barcodeFormat: 'CODE128', countries: ['AU', 'CA', 'US', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'google-play-gc',     name: 'Google Play',          logoUrl: logo('play.google.com'),       barcodeFormat: 'CODE128', countries: ['AU', 'CA', 'US', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'steam-gc',           name: 'Steam',                logoUrl: logo('store.steampowered.com'),barcodeFormat: 'CODE128', countries: ['AU', 'CA', 'US', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'netflix-gc',         name: 'Netflix',              logoUrl: logo('netflix.com'),           barcodeFormat: 'CODE128', countries: ['AU', 'CA', 'US', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: true  },
  { id: 'spotify-gc',         name: 'Spotify',              logoUrl: logo('spotify.com'),           barcodeFormat: 'CODE128', countries: ['AU', 'CA', 'US', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: true  },
  { id: 'playstation-gc',     name: 'PlayStation Store',    logoUrl: logo('playstation.com'),       barcodeFormat: 'CODE128', countries: ['AU', 'CA', 'US', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'xbox-gc',            name: 'Xbox / Microsoft',     logoUrl: logo('microsoft.com'),         barcodeFormat: 'CODE128', countries: ['AU', 'CA', 'US', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'dan-murphys-gc',     name: "Dan Murphy's",         logoUrl: logo('danmurphys.com.au'),     barcodeFormat: 'CODE128', countries: ['AU'],               requiresPin: true,  requiresExpiry: false },
  { id: 'ikea-gc-au',         name: 'IKEA',                 logoUrl: logo('ikea.com'),              barcodeFormat: 'CODE128', countries: ['AU', 'CA', 'US', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: false, requiresExpiry: false },

  // ── Canada ───────────────────────────────────────────────────────────────────

  { id: 'amazon-ca',          name: 'Amazon Canada',        logoUrl: logo('amazon.ca'),             barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: false, requiresExpiry: false },
  { id: 'tim-hortons-gc',     name: "Tim Hortons",          logoUrl: logo('timhortons.com'),        barcodeFormat: 'QR',      countries: ['CA'],               requiresPin: false, requiresExpiry: true  },
  { id: 'shoppers-gc',        name: 'Shoppers Drug Mart',   logoUrl: logo('shoppersdrugmart.ca'),   barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'loblaw-gc',          name: 'Loblaw / PC Optimum',  logoUrl: logo('pc.ca'),                 barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'canadian-tire-gc',   name: 'Canadian Tire',        logoUrl: logo('canadiantire.ca'),       barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'sport-chek-gc',      name: 'Sport Chek',           logoUrl: logo('sportchek.ca'),          barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'chapters-gc',        name: 'Indigo / Chapters',    logoUrl: logo('chapters.indigo.ca'),    barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'bestbuy-gc-ca',      name: 'Best Buy Canada',      logoUrl: logo('bestbuy.ca'),            barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'starbucks-gc-ca',    name: 'Starbucks Canada',     logoUrl: logo('starbucks.ca'),          barcodeFormat: 'QR',      countries: ['CA'],               requiresPin: false, requiresExpiry: false },
  { id: 'walmart-gc-ca',      name: 'Walmart Canada',       logoUrl: logo('walmart.ca'),            barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'home-depot-gc-ca',   name: 'Home Depot Canada',    logoUrl: logo('homedepot.ca'),          barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'winners-gc',         name: 'Winners / HomeSense',  logoUrl: logo('winners.ca'),            barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'reitmans-gc',        name: "Reitmans",             logoUrl: logo('reitmans.com'),          barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },
  { id: 'petro-canada-gc',    name: 'Petro-Canada',         logoUrl: logo('petro-canada.ca'),       barcodeFormat: 'CODE128', countries: ['CA'],               requiresPin: true,  requiresExpiry: false },

  // ── United States ─────────────────────────────────────────────────────────

  { id: 'amazon-us',          name: 'Amazon US',            logoUrl: logo('amazon.com'),            barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: false, requiresExpiry: false },
  { id: 'target-gc-us',       name: 'Target',               logoUrl: logo('target.com'),            barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'walmart-gc-us',      name: 'Walmart',              logoUrl: logo('walmart.com'),           barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'bestbuy-gc-us',      name: 'Best Buy',             logoUrl: logo('bestbuy.com'),           barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'home-depot-gc-us',   name: 'Home Depot',           logoUrl: logo('homedepot.com'),         barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'lowes-gc',           name: "Lowe's",               logoUrl: logo('lowes.com'),             barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'kohls-gc',           name: "Kohl's",               logoUrl: logo('kohls.com'),             barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'macys-gc',           name: "Macy's",               logoUrl: logo('macys.com'),             barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'nordstrom-gc',       name: 'Nordstrom',            logoUrl: logo('nordstrom.com'),         barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'gap-gc',             name: 'Gap / Old Navy',       logoUrl: logo('gap.com'),               barcodeFormat: 'CODE128', countries: ['US', 'CA'],         requiresPin: true,  requiresExpiry: false },
  { id: 'starbucks-gc-us',    name: 'Starbucks',            logoUrl: logo('starbucks.com'),         barcodeFormat: 'QR',      countries: ['US'],               requiresPin: false, requiresExpiry: false },
  { id: 'dunkin-gc',          name: "Dunkin'",              logoUrl: logo('dunkindonuts.com'),      barcodeFormat: 'QR',      countries: ['US'],               requiresPin: false, requiresExpiry: false },
  { id: 'mcdonalds-gc-us',    name: "McDonald's",           logoUrl: logo('mcdonalds.com'),         barcodeFormat: 'QR',      countries: ['US', 'CA', 'AU', 'GB'], requiresPin: false, requiresExpiry: true  },
  { id: 'doordash-gc',        name: 'DoorDash',             logoUrl: logo('doordash.com'),          barcodeFormat: 'CODE128', countries: ['US', 'CA'],         requiresPin: true,  requiresExpiry: false },
  { id: 'uber-gc',            name: 'Uber / Uber Eats',     logoUrl: logo('uber.com'),              barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB'], requiresPin: true,  requiresExpiry: false },
  { id: 'airbnb-gc',          name: 'Airbnb',               logoUrl: logo('airbnb.com'),            barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'sephora-gc-us',      name: 'Sephora',              logoUrl: logo('sephora.com'),           barcodeFormat: 'CODE128', countries: ['US', 'CA'],         requiresPin: true,  requiresExpiry: false },
  { id: 'ulta-gc',            name: 'Ulta Beauty',          logoUrl: logo('ulta.com'),              barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'gamestop-gc',        name: 'GameStop',             logoUrl: logo('gamestop.com'),          barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'publix-gc',          name: 'Publix',               logoUrl: logo('publix.com'),            barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: true,  requiresExpiry: false },
  { id: 'wholefds-gc',        name: 'Whole Foods',          logoUrl: logo('wholefoodsmarket.com'),  barcodeFormat: 'CODE128', countries: ['US'],               requiresPin: false, requiresExpiry: false },
  { id: 'visa-gc',            name: 'Visa Gift Card',       logoUrl: logo('visa.com'),              barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: true  },
  { id: 'mastercard-gc',      name: 'Mastercard Gift Card', logoUrl: logo('mastercard.com'),        barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: true  },

  // ── United Kingdom ────────────────────────────────────────────────────────

  { id: 'amazon-uk',          name: 'Amazon UK',            logoUrl: logo('amazon.co.uk'),          barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: false, requiresExpiry: false },
  { id: 'marks-spencer-gc',   name: 'Marks & Spencer',      logoUrl: logo('marksandspencer.com'),   barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: false },
  { id: 'john-lewis-gc',      name: 'John Lewis',           logoUrl: logo('johnlewis.com'),         barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: false },
  { id: 'next-gc',            name: 'Next',                 logoUrl: logo('next.co.uk'),            barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: false },
  { id: 'primark-gc',         name: 'Primark',              logoUrl: logo('primark.com'),           barcodeFormat: 'CODE128', countries: ['GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: false, requiresExpiry: false },
  { id: 'tesco-gc',           name: 'Tesco',                logoUrl: logo('tesco.com'),             barcodeFormat: 'EAN13',   countries: ['GB'],               requiresPin: true,  requiresExpiry: false },
  { id: 'sainsburys-gc',      name: "Sainsbury's",          logoUrl: logo('sainsburys.co.uk'),      barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: false },
  { id: 'boots-gc',           name: 'Boots',                logoUrl: logo('boots.com'),             barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: false },
  { id: 'currys-gc',          name: 'Currys',               logoUrl: logo('currys.co.uk'),          barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: false },
  { id: 'argos-gc',           name: 'Argos',                logoUrl: logo('argos.co.uk'),           barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: false },
  { id: 'asos-gc',            name: 'ASOS',                 logoUrl: logo('asos.com'),              barcodeFormat: 'CODE128', countries: ['GB', 'DE', 'FR', 'AU'], requiresPin: true,  requiresExpiry: false },
  { id: 'hmv-gc',             name: 'HMV',                  logoUrl: logo('hmv.com'),               barcodeFormat: 'CODE128', countries: ['GB', 'CA'],         requiresPin: true,  requiresExpiry: false },
  { id: 'costa-gc',           name: 'Costa Coffee',         logoUrl: logo('costa.co.uk'),           barcodeFormat: 'QR',      countries: ['GB'],               requiresPin: false, requiresExpiry: false },
  { id: 'greggs-gc',          name: 'Greggs',               logoUrl: logo('greggs.co.uk'),          barcodeFormat: 'QR',      countries: ['GB'],               requiresPin: false, requiresExpiry: true  },
  { id: 'pizza-express-gc',   name: 'Pizza Express',        logoUrl: logo('pizzaexpress.com'),      barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: true  },
  { id: 'deliveroo-gc',       name: 'Deliveroo',            logoUrl: logo('deliveroo.co.uk'),       barcodeFormat: 'CODE128', countries: ['GB', 'FR', 'IT', 'DE', 'NL', 'AU'], requiresPin: true,  requiresExpiry: false },
  { id: 'the-entertainer-gc', name: 'The Entertainer',      logoUrl: logo('thetoyshop.com'),        barcodeFormat: 'CODE128', countries: ['GB'],               requiresPin: true,  requiresExpiry: false },

  // ── Europe (DE, FR, NL, IT, ES) ──────────────────────────────────────────

  { id: 'amazon-de',          name: 'Amazon Germany',       logoUrl: logo('amazon.de'),             barcodeFormat: 'CODE128', countries: ['DE'],               requiresPin: false, requiresExpiry: false },
  { id: 'amazon-fr',          name: 'Amazon France',        logoUrl: logo('amazon.fr'),             barcodeFormat: 'CODE128', countries: ['FR'],               requiresPin: false, requiresExpiry: false },
  { id: 'amazon-it',          name: 'Amazon Italy',         logoUrl: logo('amazon.it'),             barcodeFormat: 'CODE128', countries: ['IT'],               requiresPin: false, requiresExpiry: false },
  { id: 'amazon-es',          name: 'Amazon Spain',         logoUrl: logo('amazon.es'),             barcodeFormat: 'CODE128', countries: ['ES'],               requiresPin: false, requiresExpiry: false },
  { id: 'zalando-gc',         name: 'Zalando',              logoUrl: logo('zalando.com'),           barcodeFormat: 'CODE128', countries: ['DE', 'FR', 'NL', 'IT', 'ES', 'GB'], requiresPin: false, requiresExpiry: false },
  { id: 'mediamarkt-gc',      name: 'MediaMarkt / Saturn',  logoUrl: logo('mediamarkt.de'),         barcodeFormat: 'CODE128', countries: ['DE', 'NL', 'IT', 'ES', 'FR'], requiresPin: true,  requiresExpiry: false },
  { id: 'fnac-gc',            name: 'Fnac',                 logoUrl: logo('fnac.com'),              barcodeFormat: 'CODE128', countries: ['FR', 'ES'],         requiresPin: true,  requiresExpiry: false },
  { id: 'decathlon-gc',       name: 'Decathlon',            logoUrl: logo('decathlon.com'),         barcodeFormat: 'CODE128', countries: ['FR', 'DE', 'IT', 'ES', 'GB', 'NL', 'AU'], requiresPin: false, requiresExpiry: false },
  { id: 'douglas-gc',         name: 'Douglas',              logoUrl: logo('douglas.de'),            barcodeFormat: 'CODE128', countries: ['DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'bol-gc',             name: 'bol.com',              logoUrl: logo('bol.com'),               barcodeFormat: 'CODE128', countries: ['NL'],               requiresPin: false, requiresExpiry: false },
  { id: 'hema-gc',            name: 'Hema',                 logoUrl: logo('hema.com'),              barcodeFormat: 'CODE128', countries: ['NL', 'DE', 'FR'],   requiresPin: false, requiresExpiry: false },
  { id: 'galeries-lafayette-gc', name: 'Galeries Lafayette', logoUrl: logo('galerieslafayette.com'), barcodeFormat: 'CODE128', countries: ['FR'],              requiresPin: true,  requiresExpiry: false },
  { id: 'el-corte-gc',        name: 'El Corte Inglés',      logoUrl: logo('elcorteingles.es'),      barcodeFormat: 'CODE128', countries: ['ES'],               requiresPin: true,  requiresExpiry: false },
  { id: 'leroy-merlin-gc',    name: 'Leroy Merlin',         logoUrl: logo('leroymerlin.com'),       barcodeFormat: 'CODE128', countries: ['FR', 'ES', 'IT'],   requiresPin: false, requiresExpiry: false },
  { id: 'thalia-gc',          name: 'Thalia',               logoUrl: logo('thalia.de'),             barcodeFormat: 'CODE128', countries: ['DE'],               requiresPin: true,  requiresExpiry: false },
  { id: 'saturn-gc',          name: 'Saturn',               logoUrl: logo('saturn.de'),             barcodeFormat: 'CODE128', countries: ['DE'],               requiresPin: true,  requiresExpiry: false },

  // ── Global / cross-region ─────────────────────────────────────────────────

  { id: 'paypal-gc',          name: 'PayPal',               logoUrl: logo('paypal.com'),            barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'ebay-gc',            name: 'eBay',                 logoUrl: logo('ebay.com'),              barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'roblox-gc',          name: 'Roblox',               logoUrl: logo('roblox.com'),            barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'nintendo-gc',        name: 'Nintendo eShop',       logoUrl: logo('nintendo.com'),          barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
  { id: 'twitch-gc',          name: 'Twitch',               logoUrl: logo('twitch.tv'),             barcodeFormat: 'CODE128', countries: ['US', 'CA', 'AU', 'GB', 'DE', 'FR', 'NL', 'IT', 'ES'], requiresPin: true,  requiresExpiry: false },
];

/**
 * Returns all gift brands active in the given ISO country code.
 * @param countryCode - e.g. 'AU', 'US', 'GB'
 */
export function getGiftBrandsForCountry(countryCode: string): GiftBrand[] {
  return GIFT_BRANDS.filter(b => b.countries.includes(countryCode));
}

/**
 * Returns the brand with the given id, or undefined if not found.
 * @param id - Brand slug (e.g. 'amazon-us')
 */
export function getGiftBrandById(id: string): GiftBrand | undefined {
  return GIFT_BRANDS.find(b => b.id === id);
}
