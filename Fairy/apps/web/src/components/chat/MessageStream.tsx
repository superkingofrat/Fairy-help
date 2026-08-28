interface MessageStreamProps {
  content: string;
}

export function MessageStream({ content }: MessageStreamProps): JSX.Element {
  return <p className="whitespace-pre-wrap text-sm text-slate-800">{content}</p>;
}
