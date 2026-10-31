const MAX_COUNT = BigInt(Number.MAX_SAFE_INTEGER);
const multipliers = { k:3, thousand:3, m:6, million:6, b:9, billion:9, t:12, trillion:12, q:15, quadrillion:15 };

export function parseCount(input) {
  const value = String(input).trim().toLowerCase().replace(/\s+(?:person|people)$/, '').replace(/[,_\s]/g, '');
  const match = value.match(/^(\d+)(?:\.(\d+))?(k|thousand|m|million|b|billion|t|trillion|q|quadrillion)?$/);
  if (!match) throw new Error('Enter a whole number, like 1,000, 100k, or 1.5 million.');
  const fraction = match[2] || '';
  const power = (multipliers[match[3]] || 0) - fraction.length;
  let exact = BigInt(match[1] + fraction);
  if (power >= 0) exact *= 10n ** BigInt(power);
  else {
    const divisor = 10n ** BigInt(-power);
    if (exact % divisor !== 0n) throw new Error('People come in whole numbers. Try rounding to a whole person.');
    exact /= divisor;
  }
  if (exact > MAX_COUNT) throw new Error('The largest exact count is 9,007,199,254,740,991 people.');
  return Number(exact);
}

export function formatCount(count) { return count.toLocaleString('en-US'); }

export function formatZoom(zoom) {
  const percent = Math.round(zoom * 100);
  return `${new Intl.NumberFormat('en-US', percent >= 10000 ? { notation:'compact', maximumFractionDigits:1 } : {}).format(percent)}%`;
}

export function meetingTime(count) {
  if (count === 0) return 'no time at all';
  const units = [[31536000,'year'],[86400,'day'],[3600,'hour'],[60,'minute'],[1,'second']];
  let seconds = BigInt(count);
  const parts = [];
  for (const [size, name] of units) {
    const amount = seconds / BigInt(size);
    if (amount > 0n) {
      parts.push(`${amount.toLocaleString('en-US')} ${name}${amount === 1n ? '' : 's'}`);
      seconds %= BigInt(size);
      if (parts.length === 2) break;
    }
  }
  return parts.join(', ');
}
