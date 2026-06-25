const STORAGE_KEY = 'favorites';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save(favs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
}

export function isFavorite(id) {
  return load().includes(id);
}

export function toggleFavorite(id) {
  const favs = load();
  const idx = favs.indexOf(id);
  if (idx === -1) {
    favs.push(id);
  } else {
    favs.splice(idx, 1);
  }
  save(favs);
  return idx === -1;
}

export function getFavorites() {
  return load();
}
