/**
 * Loyalty Brand Catalog — shared across all platforms.
 *
 * Contains 150+ popular loyalty programs for AU, CA, US, UK, and EU.
 * Each brand includes:
 *   id            — unique slug used as the brandId in the DB
 *   name          — display name
 *   logoUrl       — Google Favicon Service (no auth, works offline via cache)
 *   barcodeFormat — the encoding type needed to render the barcode correctly
 *   countries     — ISO 3166-1 alpha-2 codes where the program is active
 *
 * The barcodeFormat is the most common format used by that retailer.
 * Users can override the format when adding a card if theirs differs.
 */

import type { BarcodeFormat } from './types';

export interface LoyaltyBrand {
  id: string;
  name: string;
  logoUrl: string;
  barcodeFormat: BarcodeFormat;
  countries: string[];
}

/** Helper: build Google Favicon Service URL at 64px */
function logo(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

export const LOYALTY_BRANDS: LoyaltyBrand[] = [

  // ── Australia ──────────────────────────────────────────────────────────────

  { id: 'woolworths-au',      name: 'Woolworths Rewards',      logoUrl: logo('woolworths.com.au'),      barcodeFormat: 'EAN13',   countries: ['AU'] },
  { id: 'coles-au',           name: 'Flybuys (Coles)',          logoUrl: logo('flybuys.com.au'),          barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'myer-au',            name: 'Myer One',                 logoUrl: logo('myer.com.au'),             barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'david-jones-au',     name: 'David Jones',              logoUrl: logo('davidjones.com'),          barcodeFormat: 'QR',      countries: ['AU'] },
  { id: 'chemist-warehouse',  name: 'Chemist Warehouse',        logoUrl: logo('chemistwarehouse.com.au'), barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'priceline-au',       name: 'Priceline Sisterhood',     logoUrl: logo('priceline.com.au'),        barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'dan-murphys-au',     name: "Dan Murphy's",             logoUrl: logo('danmurphys.com.au'),       barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'jbhifi-au',          name: 'JB Hi-Fi',                 logoUrl: logo('jbhifi.com.au'),           barcodeFormat: 'QR',      countries: ['AU'] },
  { id: 'harvey-norman-au',   name: 'Harvey Norman',            logoUrl: logo('harveynorman.com.au'),     barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'bigw-au',            name: 'Big W',                    logoUrl: logo('bigw.com.au'),             barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'bunnings-au',        name: 'Bunnings PowerPass',       logoUrl: logo('bunnings.com.au'),         barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'officeworks-au',     name: 'Officeworks',              logoUrl: logo('officeworks.com.au'),      barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'bp-au',              name: 'BP Rewards',               logoUrl: logo('bp.com'),                  barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'shell-au',           name: 'Shell Coles Express',      logoUrl: logo('shell.com.au'),            barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'seven-eleven-au',    name: '7-Eleven Fuel',            logoUrl: logo('7eleven.com.au'),          barcodeFormat: 'QR',      countries: ['AU'] },
  { id: 'qantas-ff',          name: 'Qantas Frequent Flyer',   logoUrl: logo('qantas.com'),              barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'virgin-velocity',    name: 'Virgin Australia Velocity',logoUrl: logo('virginaustralia.com'),     barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'amcal-au',           name: 'Amcal',                    logoUrl: logo('amcal.com.au'),            barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'terry-white-au',     name: 'TerryWhite Chemmart',     logoUrl: logo('terrywhitechemmart.com.au'),barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'bws-au',             name: 'BWS',                      logoUrl: logo('bws.com.au'),              barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'first-choice-au',    name: 'First Choice Liquor',      logoUrl: logo('firstchoiceliquor.com.au'),barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'petstock-au',        name: 'PetStock',                 logoUrl: logo('petstock.com.au'),         barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'total-tools-au',     name: 'Total Tools',              logoUrl: logo('totaltools.com.au'),       barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'the-good-guys-au',   name: 'The Good Guys',            logoUrl: logo('thegoodguys.com.au'),      barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'spotlight-au',       name: 'Spotlight',                logoUrl: logo('spotlightstores.com'),     barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'kmart-au',           name: 'Kmart',                    logoUrl: logo('kmart.com.au'),            barcodeFormat: 'QR',      countries: ['AU'] },
  { id: 'anz-rewards-au',     name: 'ANZ Rewards',              logoUrl: logo('anz.com.au'),              barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'nab-rewards-au',     name: 'NAB Rewards',              logoUrl: logo('nab.com.au'),              barcodeFormat: 'QR',      countries: ['AU'] },
  { id: 'petbarn-au',         name: 'Petbarn',                  logoUrl: logo('petbarn.com.au'),          barcodeFormat: 'CODE128', countries: ['AU'] },
  { id: 'hoyts-au',           name: 'Hoyts Rewards',            logoUrl: logo('hoyts.com.au'),            barcodeFormat: 'QR',      countries: ['AU'] },

  // ── Canada ─────────────────────────────────────────────────────────────────

  { id: 'pc-optimum-ca',      name: 'PC Optimum',               logoUrl: logo('pcoptimum.ca'),            barcodeFormat: 'QR',      countries: ['CA'] },
  { id: 'air-miles-ca',       name: 'AIR MILES',                logoUrl: logo('airmiles.ca'),             barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'scene-plus-ca',      name: 'Scene+',                   logoUrl: logo('sceneplus.ca'),            barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'ct-triangle-ca',     name: 'Canadian Tire Triangle',   logoUrl: logo('canadiantire.ca'),         barcodeFormat: 'QR',      countries: ['CA'] },
  { id: 'petro-points-ca',    name: 'Petro-Points',             logoUrl: logo('petro-canada.ca'),         barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'aeroplan-ca',        name: 'Aeroplan (Air Canada)',    logoUrl: logo('aeroplan.com'),            barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'hbc-rewards-ca',     name: "Hudson's Bay Rewards",     logoUrl: logo('thebay.com'),              barcodeFormat: 'QR',      countries: ['CA'] },
  { id: 'esso-extra-ca',      name: 'Esso Extra',               logoUrl: logo('esso.com'),                barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'rexall-bewell-ca',   name: 'Rexall Be Well',           logoUrl: logo('rexall.ca'),               barcodeFormat: 'QR',      countries: ['CA'] },
  { id: 'best-buy-ca',        name: 'Best Buy Rewards',         logoUrl: logo('bestbuy.ca'),              barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'staples-ca',         name: 'Staples Rewards',          logoUrl: logo('staples.ca'),              barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'indigo-plum-ca',     name: 'Indigo Plum',              logoUrl: logo('chapters.indigo.ca'),      barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'sport-chek-ca',      name: 'Sport Chek',               logoUrl: logo('sportchek.ca'),            barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'marks-ca',           name: "Mark's",                   logoUrl: logo('marks.com'),               barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'sobeys-ca',          name: 'Sobeys Club',              logoUrl: logo('sobeys.com'),              barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'metro-ca',           name: 'Metro & Moi',              logoUrl: logo('metro.ca'),                barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'giant-tiger-ca',     name: 'Giant Tiger',              logoUrl: logo('gianttiger.com'),          barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'tim-hortons-ca',     name: 'Tim Hortons Rewards',      logoUrl: logo('timhortons.com'),          barcodeFormat: 'QR',      countries: ['CA'] },
  { id: 'mcdonalds-ca',       name: "McDonald's MyMcDonald's",  logoUrl: logo('mcdonalds.ca'),            barcodeFormat: 'QR',      countries: ['CA'] },
  { id: 'winners-ca',         name: 'Winners',                  logoUrl: logo('winners.ca'),              barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'shoppers-ca',        name: 'Shoppers Drug Mart',       logoUrl: logo('shoppersdrugmart.ca'),     barcodeFormat: 'CODE128', countries: ['CA'] },
  { id: 'loblaws-ca',         name: 'Loblaws',                  logoUrl: logo('loblaws.ca'),              barcodeFormat: 'QR',      countries: ['CA'] },

  // ── United States ──────────────────────────────────────────────────────────

  { id: 'kroger-us',          name: 'Kroger Plus',              logoUrl: logo('kroger.com'),              barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'target-us',          name: 'Target Circle',            logoUrl: logo('target.com'),              barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'walmart-us',         name: 'Walmart+',                 logoUrl: logo('walmart.com'),             barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'safeway-us',         name: 'Safeway Club',             logoUrl: logo('safeway.com'),             barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'cvs-us',             name: 'CVS ExtraCare',            logoUrl: logo('cvs.com'),                 barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'walgreens-us',       name: 'Walgreens myWalgreens',    logoUrl: logo('walgreens.com'),           barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'rite-aid-us',        name: 'Rite Aid Rewards',         logoUrl: logo('riteaid.com'),             barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'starbucks-us',       name: 'Starbucks Rewards',        logoUrl: logo('starbucks.com'),           barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'dunkin-us',          name: "Dunkin' Rewards",          logoUrl: logo('dunkindonuts.com'),        barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'seven-eleven-us',    name: '7-Eleven 7Rewards',        logoUrl: logo('7-eleven.com'),            barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'shell-us',           name: 'Shell Fuel Rewards',       logoUrl: logo('shell.us'),                barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'bp-us',              name: 'BP BPme Rewards',          logoUrl: logo('bp.com'),                  barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'chevron-us',         name: 'Chevron Techron Advantage',logoUrl: logo('chevron.com'),             barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'costco-us',          name: 'Costco',                   logoUrl: logo('costco.com'),              barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'sams-club-us',       name: "Sam's Club",               logoUrl: logo('samsclub.com'),            barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'home-depot-us',      name: 'The Home Depot',           logoUrl: logo('homedepot.com'),           barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'lowes-us',           name: "Lowe's",                   logoUrl: logo('lowes.com'),               barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'best-buy-us',        name: 'Best Buy My Best Buy',     logoUrl: logo('bestbuy.com'),             barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'nordstrom-us',       name: 'Nordstrom Nordy Club',     logoUrl: logo('nordstrom.com'),           barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'macys-us',           name: "Macy's Star Rewards",      logoUrl: logo('macys.com'),               barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'kohls-us',           name: "Kohl's Rewards",           logoUrl: logo('kohls.com'),               barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'jcpenney-us',        name: 'JCPenney Rewards',         logoUrl: logo('jcpenney.com'),            barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'tjmaxx-us',          name: 'TJ Maxx Rewards',          logoUrl: logo('tjmaxx.com'),              barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'barnes-noble-us',    name: 'Barnes & Noble Membership',logoUrl: logo('barnesandnoble.com'),      barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'office-depot-us',    name: 'Office Depot Rewards',     logoUrl: logo('officedepot.com'),         barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'petco-us',           name: 'Petco Pals Rewards',       logoUrl: logo('petco.com'),               barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'petsmart-us',        name: 'PetSmart Treats',          logoUrl: logo('petsmart.com'),            barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'giant-eagle-us',     name: 'Giant Eagle Advantage',    logoUrl: logo('gianteagle.com'),          barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'publix-us',          name: 'Publix',                   logoUrl: logo('publix.com'),              barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'albertsons-us',      name: "Albertsons Just4U",        logoUrl: logo('albertsons.com'),          barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'heb-us',             name: 'H-E-B',                    logoUrl: logo('heb.com'),                 barcodeFormat: 'CODE128', countries: ['US'] },
  { id: 'marriott-us',        name: 'Marriott Bonvoy',          logoUrl: logo('marriott.com'),            barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'hilton-us',          name: 'Hilton Honors',            logoUrl: logo('hilton.com'),              barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'hyatt-us',           name: 'World of Hyatt',           logoUrl: logo('hyatt.com'),               barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'delta-us',           name: 'Delta SkyMiles',           logoUrl: logo('delta.com'),               barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'united-us',          name: 'United MileagePlus',       logoUrl: logo('united.com'),              barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'aa-us',              name: 'American AAdvantage',      logoUrl: logo('aa.com'),                  barcodeFormat: 'QR',      countries: ['US'] },
  { id: 'southwest-us',       name: 'Southwest Rapid Rewards',  logoUrl: logo('southwest.com'),           barcodeFormat: 'QR',      countries: ['US'] },

  // ── United Kingdom ─────────────────────────────────────────────────────────

  { id: 'tesco-gb',           name: 'Tesco Clubcard',           logoUrl: logo('tesco.com'),               barcodeFormat: 'EAN13',   countries: ['GB'] },
  { id: 'boots-gb',           name: 'Boots Advantage Card',     logoUrl: logo('boots.com'),               barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'nectar-gb',          name: 'Nectar (Sainsbury\'s)',    logoUrl: logo('nectar.com'),              barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'waitrose-gb',        name: 'myWaitrose',               logoUrl: logo('waitrose.com'),            barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'morrisons-gb',       name: 'Morrisons More',           logoUrl: logo('morrisons.com'),           barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'ms-sparks-gb',       name: 'M&S Sparks',               logoUrl: logo('marksandspencer.com'),     barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'superdrug-gb',       name: 'Superdrug Beauty Card',    logoUrl: logo('superdrug.com'),           barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'coop-gb',            name: 'Co-op Membership',         logoUrl: logo('coop.co.uk'),              barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'bp-gb',              name: 'BP',                       logoUrl: logo('bp.com'),                  barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'shell-gb',           name: 'Shell Go+',                logoUrl: logo('shell.co.uk'),             barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'whsmith-gb',         name: 'WHSmith',                  logoUrl: logo('whsmith.co.uk'),           barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'caffe-nero-gb',      name: 'Caffè Nero',               logoUrl: logo('caffenero.com'),           barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'costa-gb',           name: 'Costa Club',               logoUrl: logo('costa.co.uk'),             barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'greggs-gb',          name: 'Greggs Rewards',           logoUrl: logo('greggs.co.uk'),            barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'waterstones-gb',     name: 'Waterstones Plus',         logoUrl: logo('waterstones.com'),         barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'john-lewis-gb',      name: 'John Lewis Partnership',   logoUrl: logo('johnlewis.com'),           barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'argos-gb',           name: 'Argos',                    logoUrl: logo('argos.co.uk'),             barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'sports-direct-gb',   name: 'Sports Direct',            logoUrl: logo('sportsdirect.com'),        barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'pret-gb',            name: 'Pret Perks',               logoUrl: logo('pret.co.uk'),              barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'ba-exec-gb',         name: 'British Airways Exec Club',logoUrl: logo('britishairways.com'),      barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'virgin-atlantic-gb', name: 'Virgin Atlantic Flying Club',logoUrl: logo('virginatlantic.com'),   barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'aldi-gb',            name: 'Aldi Specialbuys',         logoUrl: logo('aldi.co.uk'),              barcodeFormat: 'QR',      countries: ['GB'] },
  { id: 'ikea-gb',            name: 'IKEA Family',              logoUrl: logo('ikea.com/gb'),             barcodeFormat: 'CODE128', countries: ['GB'] },
  { id: 'o2-gb',              name: 'O2 Priority',              logoUrl: logo('o2.co.uk'),                barcodeFormat: 'QR',      countries: ['GB'] },

  // ── Europe (multi-country) ─────────────────────────────────────────────────

  { id: 'ikea-eu',            name: 'IKEA Family',              logoUrl: logo('ikea.com'),                barcodeFormat: 'CODE128', countries: ['DE','AT','NL','BE','FR','ES','IT','PL','SE','FI','DK','NO','CH','CZ','SK','HU','RO'] },
  { id: 'lidl-plus-eu',       name: 'Lidl Plus',                logoUrl: logo('lidl.de'),                 barcodeFormat: 'QR',      countries: ['DE','AT','NL','BE','FR','ES','IT','PL','PT','IE','FI','DK','SE'] },
  { id: 'decathlon-eu',       name: 'Decathlon Club',           logoUrl: logo('decathlon.com'),           barcodeFormat: 'QR',      countries: ['FR','DE','ES','IT','BE','NL','PL','PT','AT','CZ','RO'] },
  { id: 'rewe-de',            name: 'REWE Punkte',              logoUrl: logo('rewe.de'),                 barcodeFormat: 'CODE128', countries: ['DE','AT'] },
  { id: 'dm-de',              name: 'dm-drogerie markt',        logoUrl: logo('dm.de'),                   barcodeFormat: 'CODE128', countries: ['DE','AT','HR','SI','SK','CZ','HU','RO','BG','RS','BA'] },
  { id: 'rossmann-de',        name: 'Rossmann',                 logoUrl: logo('rossmann.de'),             barcodeFormat: 'CODE128', countries: ['DE','PL','CZ','HU','AL'] },
  { id: 'penny-de',           name: 'Penny',                    logoUrl: logo('penny.de'),                barcodeFormat: 'CODE128', countries: ['DE','AT','RO'] },
  { id: 'kaufland-de',        name: 'Kaufland Card',            logoUrl: logo('kaufland.de'),             barcodeFormat: 'CODE128', countries: ['DE','CZ','PL','SK','RO','HR','BG','MD'] },
  { id: 'mediamarkt-eu',      name: 'MediaMarkt Club',          logoUrl: logo('mediamarkt.de'),           barcodeFormat: 'QR',      countries: ['DE','AT','NL','BE','ES','IT','CH','PL','PT','SE','HU'] },
  { id: 'aldi-sued-de',       name: 'Aldi Süd myALDI',         logoUrl: logo('aldi-sued.de'),            barcodeFormat: 'QR',      countries: ['DE','AT','NL','BE'] },
  { id: 'ah-nl',              name: 'Albert Heijn Bonuskaart',  logoUrl: logo('ah.nl'),                   barcodeFormat: 'CODE128', countries: ['NL','BE'] },
  { id: 'jumbo-nl',           name: 'Jumbo Extra\'s',           logoUrl: logo('jumbo.com'),               barcodeFormat: 'CODE128', countries: ['NL','BE'] },
  { id: 'carrefour-fr',       name: 'Carrefour +',              logoUrl: logo('carrefour.fr'),            barcodeFormat: 'CODE128', countries: ['FR','BE','ES','IT','PL','RO','PT'] },
  { id: 'leclerc-fr',         name: 'E.Leclerc',                logoUrl: logo('e.leclerc'),               barcodeFormat: 'CODE128', countries: ['FR','ES','PL','PT'] },
  { id: 'intermarche-fr',     name: 'Intermarché',              logoUrl: logo('intermarche.com'),         barcodeFormat: 'CODE128', countries: ['FR','BE','PT'] },
  { id: 'casino-fr',          name: 'Casino Avantage',          logoUrl: logo('groupe-casino.fr'),        barcodeFormat: 'CODE128', countries: ['FR'] },
  { id: 'fnac-fr',            name: 'Fnac+',                    logoUrl: logo('fnac.com'),                barcodeFormat: 'QR',      countries: ['FR','BE','ES','PT'] },
  { id: 'air-france-fr',      name: 'Air France Flying Blue',   logoUrl: logo('airfrance.com'),           barcodeFormat: 'QR',      countries: ['FR','NL','BE'] },
  { id: 'spar-eu',            name: 'SPAR',                     logoUrl: logo('spar.com'),                barcodeFormat: 'CODE128', countries: ['AT','IT','NL','IE','GB','ZA','HU','SI','CZ','SK','DE'] },
  { id: 'billa-at',           name: 'BILLA Plus',               logoUrl: logo('billa.at'),                barcodeFormat: 'CODE128', countries: ['AT','CZ','SK'] },
  { id: 'hofer-at',           name: 'Hofer',                    logoUrl: logo('hofer.at'),                barcodeFormat: 'QR',      countries: ['AT','SI'] },
  { id: 'miles-more-de',      name: 'Miles & More (Lufthansa)', logoUrl: logo('miles-and-more.com'),      barcodeFormat: 'QR',      countries: ['DE','AT','CH'] },
  { id: 'mercadona-es',       name: 'Mercadona',                logoUrl: logo('mercadona.es'),            barcodeFormat: 'CODE128', countries: ['ES','PT'] },
  { id: 'el-corte-es',        name: 'El Corte Inglés Club',     logoUrl: logo('elcorteingles.es'),        barcodeFormat: 'CODE128', countries: ['ES','PT'] },
  { id: 'esselunga-it',       name: 'Esselunga Fìdaty',         logoUrl: logo('esselunga.it'),            barcodeFormat: 'CODE128', countries: ['IT'] },
  { id: 'coop-it',            name: 'Coop & Coop',              logoUrl: logo('e.coop.it'),               barcodeFormat: 'CODE128', countries: ['IT','CH'] },
  { id: 'migros-ch',          name: 'Migros Cumulus',           logoUrl: logo('migros.ch'),               barcodeFormat: 'EAN13',   countries: ['CH'] },
  { id: 's-group-fi',         name: 'S-Group Bonus',            logoUrl: logo('s-kanava.fi'),             barcodeFormat: 'CODE128', countries: ['FI'] },
  { id: 'k-group-fi',         name: 'K-Plussa',                 logoUrl: logo('k-ryhmä.fi'),              barcodeFormat: 'CODE128', countries: ['FI'] },
  { id: 'rimi-baltic',        name: 'Rimi',                     logoUrl: logo('rimi.lv'),                 barcodeFormat: 'CODE128', countries: ['LV','LT','EE'] },
  { id: 'maxima-baltic',      name: 'Maxima',                   logoUrl: logo('maxima.lt'),               barcodeFormat: 'CODE128', countries: ['LT','LV','EE','BG'] },
  { id: 'biedronka-pl',       name: 'Biedronka',                logoUrl: logo('biedronka.pl'),            barcodeFormat: 'CODE128', countries: ['PL'] },
  { id: 'auchan-eu',          name: 'Auchan',                   logoUrl: logo('auchan.fr'),               barcodeFormat: 'CODE128', countries: ['FR','PL','RO','IT','ES','PT'] },
  { id: 'saturn-eu',          name: 'Saturn Club',              logoUrl: logo('saturn.de'),               barcodeFormat: 'QR',      countries: ['DE','AT','NL'] },
];

/**
 * Returns brands available in the given country, sorted alphabetically.
 *
 * @param countryCode - ISO 3166-1 alpha-2 code (e.g. 'AU', 'US')
 * @returns Filtered and sorted brand list
 */
export function getBrandsForCountry(countryCode: string): LoyaltyBrand[] {
  return LOYALTY_BRANDS
    .filter((b) => b.countries.includes(countryCode))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns a brand by its unique slug ID, or undefined if not found.
 *
 * @param brandId - Slug from the catalog (e.g. 'woolworths-au')
 */
export function getBrandById(brandId: string): LoyaltyBrand | undefined {
  return LOYALTY_BRANDS.find((b) => b.id === brandId);
}
