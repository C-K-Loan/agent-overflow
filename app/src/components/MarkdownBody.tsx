import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-pre:bg-[#1e1e1e] prose-pre:text-[#d4d4d4] prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
