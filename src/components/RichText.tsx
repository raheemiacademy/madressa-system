'use client';

import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';

/** A small rich-text box (Tiptap) that posts its HTML as a hidden field. The server cleans the HTML again. */
export function RichText({ name, label, defaultValue = '', help }: { name: string; label: string; defaultValue?: string; help?: string }) {
  const [html, setHtml] = useState(defaultValue);
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, protocols: ['https', 'mailto'] } })],
    content: defaultValue,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'ra-rich-body', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label } },
    onUpdate: ({ editor: e }) => setHtml(e.getHTML())
  });
  const active = useEditorState({ editor, selector: ({ editor: e }) => ({
    bold: !!e?.isActive('bold'), italic: !!e?.isActive('italic'), underline: !!e?.isActive('underline'), h2: !!e?.isActive('heading', { level: 2 }),
    bullet: !!e?.isActive('bulletList'), ordered: !!e?.isActive('orderedList'), link: !!e?.isActive('link')
  }) });
  const btn = (key: keyof NonNullable<typeof active>, text: string, run: () => void) => (
    <button type="button" className="ra-filter" aria-pressed={!!active?.[key]} onClick={run} disabled={!editor}>{text}</button>
  );
  return (
    <div className="ra-field full">
      <span className="lbl" id={`${name}-label`}>{label}</span>
      <div className="ra-rich">
        <div className="ra-filters" role="toolbar" aria-label={`${label} formatting`}>
          {btn('bold', 'Bold', () => editor?.chain().focus().toggleBold().run())}
          {btn('italic', 'Italic', () => editor?.chain().focus().toggleItalic().run())}
          {btn('underline', 'Underline', () => editor?.chain().focus().toggleUnderline().run())}
          {btn('h2', 'Heading', () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
          {btn('bullet', 'Bullets', () => editor?.chain().focus().toggleBulletList().run())}
          {btn('ordered', 'Numbers', () => editor?.chain().focus().toggleOrderedList().run())}
          {btn('link', 'Link', () => {
            if (editor?.isActive('link')) { editor.chain().focus().unsetLink().run(); return; }
            const url = window.prompt('Link address (https://…)');
            if (url && /^(https:\/\/|mailto:)/.test(url)) editor?.chain().focus().setLink({ href: url }).run();
          })}
        </div>
        <EditorContent editor={editor} />
      </div>
      {help && <span className="help">{help}</span>}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
