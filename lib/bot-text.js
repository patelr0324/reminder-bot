/**
 * Bot-authored Discord copy: lowercase, no emoji. Do not pass user-written reminder text.
 */
function stripEmojis(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\uFE0F/g, '');
}

function botSay(s) {
  if (typeof s !== 'string') return s;
  return stripEmojis(s).toLowerCase();
}

module.exports = { botSay, stripEmojis };
