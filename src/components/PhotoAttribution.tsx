export default function PhotoAttribution({ url }: { url: string | null }) {
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground hover:underline"
    >
      Photo via Wikipedia
    </a>
  );
}
