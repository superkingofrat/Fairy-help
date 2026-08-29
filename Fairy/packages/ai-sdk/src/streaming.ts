export interface SseBlock {
  event: string | null;
  data: string;
}

function blockToSseBlock(block: string): SseBlock | null {
  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (event === null && dataLines.length === 0) {
    return null;
  }

  return { event, data: dataLines.join("\n") };
}

export async function* parseSseBlocks(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseBlock> {
  const decoder = new TextDecoder();
  let buffer = "";

  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = blockToSseBlock(block);
        if (parsed) {
          yield parsed;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    const tail = buffer.trim();
    if (tail) {
      const parsed = blockToSseBlock(tail);
      if (parsed) {
        yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
