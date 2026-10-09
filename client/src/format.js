// All dates are shown in UTC - the same clock the model's "night-time" feature uses.
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
});
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDayFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
});

export const money = (n) => usd.format(n ?? 0);
export const moneyWhole = (n) => usdWhole.format(n ?? 0);
export const moneyCompact = (n) => (Math.abs(n ?? 0) < 10_000 ? usdWhole.format(n ?? 0) : usdCompact.format(n));
export const count = (n) => whole.format(n ?? 0);
export const percent = (ratio, digits = 1) => `${((ratio ?? 0) * 100).toFixed(digits)}%`;
export const dateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '');
export const day = (iso) => (iso ? dayFmt.format(new Date(iso)) : '');
export const longDay = (iso) => (iso ? longDayFmt.format(new Date(iso)) : '');
export const maskAccount = (number) => `•••• ${String(number).slice(-4)}`;

const TYPE_LABELS = {
  deposit: 'Deposit', withdrawal: 'Withdrawal', payment: 'Card payment',
  transfer_in: 'Transfer in', transfer_out: 'Transfer out',
};
const CHANNEL_LABELS = { branch: 'Branch', atm: 'ATM', online: 'Online', mobile: 'Mobile app', pos: 'Card terminal' };

export const typeLabel = (type) => TYPE_LABELS[type] || type;
export const channelLabel = (channel) => CHANNEL_LABELS[channel] || channel;
export const CHANNELS = Object.keys(CHANNEL_LABELS);
export const TYPES = Object.keys(TYPE_LABELS);
export const CATEGORIES = ['groceries', 'dining', 'fuel', 'utilities', 'travel', 'electronics', 'health', 'entertainment'];
export const capitalize = (text) => (text ? text[0].toUpperCase() + text.slice(1) : '');
