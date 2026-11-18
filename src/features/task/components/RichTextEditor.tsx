import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Image as ImageIcon,
  Heading2,
} from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { prompt } from '@/hooks/use-prompt';

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground kd-transition',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const addLink = async () => {
    const url = await prompt({ title: 'Add link', description: 'Enter a URL.', placeholder: 'https://' });
    if (!url) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  const addImage = async () => {
    const url = await prompt({ title: 'Insert image', description: 'Enter an image URL.', placeholder: 'https://' });
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
      <ToolbarButton label="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Checklist" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListTodo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive('link')} onClick={addLink}>
        <Link2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Image" onClick={addImage}>
        <ImageIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

/**
 * The description editor (section 7.7): headings, lists, checkboxes, links
 * and images. @mentions are a Phase 5 extension on top of this, not added
 * yet.
 */
export function RichTextEditor({
  content,
  onChange,
  placeholder,
  editable = true,
  className,
}: {
  content: unknown;
  onChange?: (json: unknown, text: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Image,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: (content as object) ?? '',
    editable,
    editorProps: {
      attributes: {
        class: cn('prose prose-sm max-w-none focus:outline-none min-h-[80px] text-sm text-foreground', className),
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getJSON(), e.getText());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content ?? '');
    if (current !== next && !editor.isFocused) {
      editor.commands.setContent((content as object) ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-border">
      {editable && <Toolbar editor={editor} />}
      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
