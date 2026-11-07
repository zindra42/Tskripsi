/*
 * Sastrawi 1.2.0 context, precedence and morphology rules ported to TypeScript.
 * Copyright (c) 2015 Andy Librian. MIT license, reproduced in STEMMER-LICENSE.
 * Canonical source commit 31fd4261dd4980cc57447f44d1aec4bd69e2abec.
 * ts-sastrawi supplies its Kateglo base-word dictionary through its public API.
 */
import { defaultDictionary } from "ts-sastrawi";

const dictionary = defaultDictionary();
// Reconcile the dictionary against the exact PHP dependency pinned by composer.lock.
dictionary.remove(["relawan"]);
dictionary.add(['oper "v,"']);
const contains = (word: string) => dictionary.contains(word);
type Rule = { pattern: RegExp; replacements: string[] };
const rule = (pattern: RegExp, ...replacements: string[]): Rule => ({ pattern, replacements });

// Grouping and alternative order match VisitorProvider and PrefixDisambiguator.
const prefixRules: Rule[][] = [
  [rule(/^(di|ke|se)(.*)$/, "$2")],
  [rule(/^ber([aiueo].*)$/, "$1", "r$1")],
  [rule(/^ber([bcdfghjklmnpqrstvwxyz])([a-z])(?!er)(.*)$/, "$1$2$3")],
  [rule(/^ber([bcdfghjklmnpqstvwxyz])([a-z])er([aiueo])(.*)$/, "$1$2er$3$4")],
  [rule(/^belajar$/, "ajar")],
  [rule(/^be([bcdfghjklmnpqstvwxyz])(er[bcdfghjklmnpqrstvwxyz])(.*)$/, "$1$2$3")],
  [rule(/^ter([aiueo].*)$/, "$1", "r$1")],
  [rule(/^ter([bcdfghjklmnpqstvwxyz])er([aiueo].*)$/, "$1er$2")],
  [rule(/^ter([bcdfghjklmnpqstvwxyz])(?!er)(.*)$/, "$1$2")],
  [rule(/^te([bcdfghjklmnpqstvwxyz])er([bcdfghjklmnpqrstvwxyz])(.*)$/, "$1er$2$3")],
  [rule(/^me([lrwy])([aiueo])(.*)$/, "$1$2$3")],
  [rule(/^mem([bfv])(.*)$/, "$1$2")],
  [rule(/^mempe(.*)$/, "pe$1")],
  [rule(/^mem([aiueo])(.*)$/, "m$1$2", "p$1$2")],
  [rule(/^men([cdjstz])(.*)$/, "$1$2")],
  [rule(/^men([aiueo])(.*)$/, "n$1$2", "t$1$2")],
  [rule(/^meng([g|h|q|k])(.*)$/, "$1$2")],
  [rule(/^meng([aiueo])(.*)$/, "$1$2", "k$1$2"), rule(/^menge(.*)$/, "$1"), rule(/^meng([aiueo])(.*)$/, "ng$1$2")],
  [rule(/^meny([aiueo])(.*)$/, "ny$1$2", "s$1$2")],
  [rule(/^memp([abcdfghijklmopqrstuvwxyz])(.*)$/, "p$1$2")],
  [rule(/^pe([wy])([aiueo])(.*)$/, "$1$2$3")],
  [rule(/^per([aiueo])(.*)$/, "$1$2", "r$1$2")],
  [rule(/^per([bcdfghjklmnpqrstvwxyz])([a-z])(?!er)(.*)$/, "$1$2$3")],
  [rule(/^per([bcdfghjklmnpqstvwxyz])([a-z])er([aiueo])(.*)$/, "$1$2er$3$4")],
  [rule(/^pem([bfv])(.*)$/, "$1$2")],
  [rule(/^pem([aiueo])(.*)$/, "m$1$2", "p$1$2")],
  [rule(/^pen([cdjstz])(.*)$/, "$1$2")],
  [rule(/^pen([aiueo])(.*)$/, "n$1$2", "t$1$2")],
  [rule(/^peng([bcdfghjklmnpqrstvwxyz])(.*)$/, "$1$2")],
  [rule(/^peng([aiueo])(.*)$/, "$1$2", "k$1$2"), rule(/^penge(.*)$/, "$1")],
  [rule(/^peny([aiueo])(.*)$/, "ny$1$2", "s$1$2")],
  [rule(/^pelajar$/, "ajar"), rule(/^pe(l[aiueo])(.*)$/, "$1$2")],
  [rule(/^pe([bcdfghjklmnpqrstvwxyz])(?!er)(.*)$/, "$1$2")],
  [rule(/^ter([bcdfghjkpqstvxz])(er[bcdfghjklmnpqrstvwxyz])(.*)$/, "$1$2$3")],
  [rule(/^pe([bcdfghjkpqstvxz])(er[bcdfghjklmnpqrstvwxyz])(.*)$/, "$1$2$3")],
  [rule(/^([bcdfghjklmnpqrstvwxyz])(er[aiueo])(.*)$/, "$1$2$3"), rule(/^([bcdfghjklmnpqrstvwxyz])er([aiueo])(.*)$/, "$1$2$3")],
  [rule(/^([bcdfghjklmnpqrstvwxyz])(el[aiueo])(.*)$/, "$1$2$3"), rule(/^([bcdfghjklmnpqrstvwxyz])el([aiueo])(.*)$/, "$1$2$3")],
  [rule(/^([bcdfghjklmnpqrstvwxyz])(em[aiueo])(.*)$/, "$1$2$3"), rule(/^([bcdfghjklmnpqrstvwxyz])em([aiueo])(.*)$/, "$1$2$3")],
  [rule(/^([bcdfghjklmnpqrstvwxyz])(in[aiueo])(.*)$/, "$1$2$3"), rule(/^([bcdfghjklmnpqrstvwxyz])in([aiueo])(.*)$/, "$1$2$3")],
  [rule(/^ku(.*)$/, "$1")],
  [rule(/^kau(.*)$/, "$1")],
];
type Removal = { subject: string; result: string; suffix: string; prefix: boolean };

class Context {
  current: string;
  removals: Removal[] = [];
  constructor(readonly original: string) { this.current = original; }

  removePrefixes() {
    for (let count = 0; count < 3; count++) {
      for (const group of prefixRules) {
        let result: string | null = null;
        for (const entry of group) {
          if (!entry.pattern.test(this.current)) { result = null; continue; }
          for (const replacement of entry.replacements) {
            result = this.current.replace(entry.pattern, replacement);
            if (contains(result)) break;
          }
          if (result !== null && contains(result)) break;
        }
        if (result !== null) {
          this.removals.push({ subject: this.current, result, suffix: "", prefix: true });
          this.current = result;
          break;
        }
      }
      if (contains(this.current)) return;
    }
  }

  removeSuffixes() {
    for (const pattern of [/-*(lah|kah|tah|pun)$/, /-*(ku|mu|nya)$/, /(is|isme|isasi|i|kan|an)$/]) {
      const result = this.current.replace(pattern, "");
      if (result !== this.current) {
        this.removals.push({ subject: this.current, result, suffix: this.current.slice(result.length), prefix: false });
        this.current = result;
      }
      if (contains(this.current)) return;
    }
  }

  restoreSuffixes() {
    const firstPrefix = this.removals.find((item) => item.prefix);
    if (firstPrefix) this.current = firstPrefix.subject;
    this.removals = this.removals.filter((item) => !item.prefix);
    const removals = [...this.removals];
    const current = this.current;
    for (const removal of [...removals].reverse()) {
      if (removal.suffix === "kan") {
        this.current = removal.result + "k";
        this.removePrefixes();
        if (contains(this.current)) return;
      }
      this.current = removal.subject;
      this.removePrefixes();
      if (contains(this.current)) return;
      this.removals = [...removals];
      this.current = current;
    }
  }

  execute() {
    if (this.original.length <= 3 || contains(this.current)) return this.original;
    if (/^(be.*lah|be.*an|me.*i|di.*i|pe.*i|ter.*i)$/.test(this.original)) {
      this.removePrefixes();
      if (contains(this.current)) return this.current;
      this.removeSuffixes();
      if (contains(this.current)) return this.current;
      this.current = this.original;
      this.removals = [];
    }
    this.removeSuffixes();
    if (contains(this.current)) return this.current;
    this.removePrefixes();
    if (contains(this.current)) return this.current;
    this.restoreSuffixes();
    return contains(this.current) ? this.current : this.original;
  }
}

export function stemWord(word: string) {
  return new Context(word).execute();
}
