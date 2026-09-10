import { useState, useRef, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';

const EMOJI_CATEGORIES: Array<{ label: string; emojis: string[] }> = [
  {
    label: 'Smileys',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐'],
  },
  {
    label: 'Objects',
    emojis: ['📝','📋','📌','📎','🔗','📐','📏','🔧','🔨','⚙️','🔩','🧲','💡','🔌','🔋','💻','🖥️','🖨️','⌨️','🖱️','💾','💿','📀','🎬','📷','📹','🔍','🔎','🔬','🔭','📡','💰','💳','💎','⚖️','🔑','🗝️','🧰','🧲','🧪','🧫','🧬','📊','📈','📉','📆','📅','🗓️','📇','🗃️','🗄️','📂','📁','📰','🗞️','📒','📕','📗','📘','📙','📚','📖','🏷️','✉️','📧','📨'],
  },
  {
    label: 'People',
    emojis: ['👤','👥','👫','👬','👭','👨‍💻','👩‍💻','👨‍💼','👩‍💼','👨‍🔬','👩‍🔬','👨‍🎓','👩‍🎓','👨‍🏫','👩‍🏫','👨‍⚕️','👩‍⚕️','👨‍🍳','👩‍🍳','👨‍🔧','👩‍🔧','👨‍🏭','👩‍🏭','👨‍🎨','👩‍🎨','👨‍✈️','👩‍✈️','👮','🕵️','💂','🧑‍🚀','🧑‍🚒','🧑‍⚖️','🦸','🦹','🧙','🧛','🧜','🧝','🧞','💪','🤝','🙏','✌️','🤞','👍','👎','👏','🙌'],
  },
  {
    label: 'Nature',
    emojis: ['🌱','🌿','🍀','🌵','🌲','🌳','🌴','🪴','🌺','🌸','🌼','🌻','🌹','🪷','💐','🍄','🐚','🌍','🌎','🌏','🌙','⭐','🌟','✨','⚡','🔥','🌊','💧','☁️','🌈','🌤️','☀️','🌦️','❄️','🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐨','🦁','🐯','🐸','🐵','🦄','🐝','🦋','🐠','🐬','🐳','🦈'],
  },
  {
    label: 'Food',
    emojis: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🌽','🥕','🧅','🥒','🥬','🥦','🧄','🍄','🥜','🍞','🥐','🥖','🧀','🥚','🍳','🥞','🧇','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🧁','🍰','🎂','🍩','🍪','🍫','🍬','🍭','☕','🍵','🧃','🧋'],
  },
  {
    label: 'Travel',
    emojis: ['🏠','🏡','🏢','🏣','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏗️','🗼','🗽','⛪','🕌','🕍','🛕','🏛️','🏟️','🎪','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','✈️','🚀','🛸','🚁','🛶','⛵','🚢','🚂','🚆','🚇','🗺️','🧭','⛰️','🏔️','🗻','🏕️','🏖️','🏝️'],
  },
  {
    label: 'Symbols',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','♻️','⚠️','🚫','⛔','📛','🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪','🔶','🔷','🔸','🔹','▪️','▫️','◾','◽','⬛','⬜','🏁','🚩','🎌','🏴','🏳️','✅','❌','❓','❗','‼️','⁉️','💯','🔅','🔆','♾️','💲','🏆','🥇','🥈','🥉','🎯','🎮'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    e.stopPropagation();
  }, [onClose]);

  const filteredCategories = search.trim()
    ? [{ label: 'Results', emojis: EMOJI_CATEGORIES.flatMap(c => c.emojis) }]
    : EMOJI_CATEGORIES;

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-xl w-[280px] animate-[panelSlideDown_150ms_ease-out]"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <div className="p-2 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#F4F4F5] dark:bg-[hsl(200,25%,14%)]">
          <Search size={12} className="text-[#9AA2AF] shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-xs text-[#374151] dark:text-[hsl(200,25%,88%)] outline-none placeholder-[#9AA2AF]"
            placeholder="Search emoji..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {!search.trim() && (
        <div className="flex gap-0.5 px-2 pt-1.5 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] pb-1">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              className={`px-1.5 py-0.5 text-3xs rounded transition-colors ${
                i === activeCategory
                  ? 'bg-[#2D7FF9]/10 text-[#2D7FF9] font-medium'
                  : 'text-[#9AA2AF] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)]'
              }`}
              onClick={() => setActiveCategory(i)}
            >
              {cat.emojis[0]}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-[200px] overflow-y-auto p-2">
        {(search.trim() ? filteredCategories : [filteredCategories[activeCategory]]).map((cat) => (
          <div key={cat.label}>
            <div className="text-3xs font-medium text-[#9AA2AF] uppercase tracking-wider mb-1">{cat.label}</div>
            <div className="grid grid-cols-8 gap-0.5">
              {cat.emojis.map((emoji) => (
                <button
                  key={emoji}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,14%)] text-lg transition-colors"
                  onClick={() => { onSelect(emoji); onClose(); }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="p-1.5 border-t border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] flex justify-end">
        <button
          className="text-2xs text-red-500 hover:text-red-600 px-2 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          onClick={() => { onSelect(''); onClose(); }}
        >
          Remove icon
        </button>
      </div>
    </div>
  );
}
