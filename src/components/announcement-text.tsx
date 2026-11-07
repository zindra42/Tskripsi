// Keep announcement text escaped by React; only HTTP(S) URLs become links.
export function AnnouncementText({ text }: { text: string }) {
  return <p className="mb-4 whitespace-pre-wrap break-words">{text.split(/(https?:\/\/[^\s<>"']+)/gi).map((part, index) =>
    /^https?:\/\//i.test(part) ? <a key={index} className="underline" href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part)}</p>;
}
