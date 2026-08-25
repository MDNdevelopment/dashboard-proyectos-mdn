import AiAvatar from './AiAvatar'
import { parseMarkdownLite } from '../../lib/renderMarkdownLite'

function FormattedText({ text }) {
  return parseMarkdownLite(text).map((part, i) =>
    part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
  )
}

export default function AiChatMessage({ role, text }) {
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-[#111] text-white px-3.5 py-2.5 text-[14px] whitespace-pre-wrap break-words">
          {text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-end gap-2">
      <AiAvatar size={40} bordered />
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white border border-[#e0ddd4] px-3.5 py-2.5 text-[14px] text-[#111] whitespace-pre-wrap break-words">
        <FormattedText text={text} />
      </div>
    </div>
  )
}
