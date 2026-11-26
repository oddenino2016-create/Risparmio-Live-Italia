import type { DealCategory } from '../src/types/offers.js';

const CATEGORY_RULES: Array<{ id: DealCategory; patterns: RegExp[] }> = [
  {
    id: 'electronics',
    patterns: [
      /\b(mediaworld|unieuro|euronics|trony|monclick|shelly|lenovo|samsung|apple|hp|dell|asus|acer|xiaomi|dyson|philips|bosch|autodoc|bricoman|electronics|elettronica|smartphone|computer|laptop|notebook|tv|audio|tech|domotica|fotocamera|tablet|console|software|vpn|hosting)\b/i,
    ],
  },
  {
    id: 'fashion',
    patterns: [
      /\b(adidas|nike|puma|tezenis|intimissimi|calzedonia|escarpe|jd\s*sports|michael\s*kors|yoox|zalando|asos|shein|ovs|zara|h&m|mango|abbigliamento|scarpe|moda|fashion|gioielli|orologi|borse|accessori|occhiali|ray-ban|intimo|sportswear)\b/i,
    ],
  },
  {
    id: 'home-goods',
    patterns: [
      /\b(emma\s*materass|manomano|ikea|leroy\s*merlin|kasanova|maison|arredamento|casa|arredo|materass|mobili|cucina|giardino|brico|elettrodomestici|detersivi|ace|albero\s*di\s*natale|lenzuola|home|decorazioni|illuminazione|ferramenta|fai\s*da\s*te)\b/i,
    ],
  },
  {
    id: 'travel',
    patterns: [
      /\b(flixbus|accor|radisson|lastminute|europcar|expedia|hotels|edreams|booking|ryanair|easyjet|ita\s*airways|trenitalia|italo|volagratis|viaggi|hotel|voli|noleggio|vacanze|crociere|travel|alloggi|traghetti|assicurazione\s*viaggio|bagagli)\b/i,
    ],
  },
  {
    id: 'groceries',
    patterns: [
      /\b(just\s*eat|glovo|deliveroo|huggies|natural\s*trainer|bauzaar|arcaplanet|supermercat|spesa|esselunga|conad|carrefour|coop|lidl|eurospin|pam|alimentari|food|cibo|bevande|caff[eè]|pasta|biscotti|cioccolat|mon\s*ch[eé]r[iì]|pannolini|animali|pet|crocchette|groceries)\b/i,
    ],
  },
  {
    id: 'entertainment',
    patterns: [
      /\b(storytel|feltrinelli|lafeltrinelli|mondadori|ibs|netflix|spotify|disney|prime\s*video|dazn|now\s*tv|cinema|teatro|ticketone|libri|ebook|audiolibri|podcast|giocattoli|giochi|videogiochi|nintendo|playstation|xbox|lego|sondaggi|intrattenimento|entertainment|musica)\b/i,
    ],
  },
  {
    id: 'beauty-health',
    patterns: [
      /\b(bottega\s*verde|sephora|notino|redcare|efarma|euphidra|dove|mentadent|l['’]?oreal|bronchenolo|physiomer|libenar|myprotein|lookfantastic|douglas|pinalli|farmacia|salute|benessere|beauty|cosmetic|make-up|profum|skincare|capelli|integratori|igiene|denti)\b/i,
    ],
  },
];

const MULTI_CATEGORY_MARKETPLACES: Array<{ pattern: RegExp; tags: DealCategory[] }> = [
  { pattern: /\b(amazon|ebay|aliexpress|temu)\b/i, tags: ['electronics', 'home-goods', 'fashion'] },
  { pattern: /\b(bbva|conto|banca|carte|finanza)\b/i, tags: ['travel', 'entertainment'] },
];

export function categorizeDeal(
  title: string,
  merchant: string,
  description: string,
  offerUrl: string
): DealCategory[] {
  const haystack = `${merchant} ${title} ${description} ${offerUrl}`.toLowerCase();
  const matched = new Set<DealCategory>();

  for (const mp of MULTI_CATEGORY_MARKETPLACES) {
    if (mp.pattern.test(haystack)) {
      for (const t of mp.tags) matched.add(t);
    }
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((re) => re.test(haystack))) {
      matched.add(rule.id);
    }
  }

  if (matched.size === 0) {
    // Intelligent fallback based on common Italian retail patterns
    if (/rimborso|spesa|prodotti|negozi/i.test(haystack)) {
      matched.add('groceries');
    } else {
      matched.add('home-goods');
    }
  }

  return Array.from(matched).slice(0, 3);
}
