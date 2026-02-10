export enum TrieResult {
  FAILED = 0,
  PREFIX = 1,
  EXISTS = 2,
}

// The trie is represented as nested Maps. The key 0 (number) marks terminal nodes.
export type Trie = Map<string | 0, Trie | true>;

export function newTrie(
  keywords: Iterable<Iterable<string | number>>,
  trie?: Trie,
): Trie {
  trie = trie ?? new Map();

  for (const key of keywords) {
    let current: Trie = trie;
    for (const char of key) {
      const charKey = char as string;
      if (!current.has(charKey)) {
        current.set(charKey, new Map());
      }
      current = current.get(charKey) as Trie;
    }
    current.set(0, true);
  }

  return trie;
}

export function inTrie(trie: Trie, key: Iterable<string>): [TrieResult, Trie] {
  const keyArray = typeof key === "string" ? [...key] : [...key];

  if (keyArray.length === 0) {
    return [TrieResult.FAILED, trie];
  }

  let current: Trie = trie;
  for (const char of keyArray) {
    if (!current.has(char)) {
      return [TrieResult.FAILED, current];
    }
    current = current.get(char) as Trie;
  }

  if (current.has(0)) {
    return [TrieResult.EXISTS, current];
  }

  return [TrieResult.PREFIX, current];
}
