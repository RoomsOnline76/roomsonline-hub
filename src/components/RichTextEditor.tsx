import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRef, useState, useEffect } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link as LinkIcon, Image as ImageIcon,
  Undo, Redo, Palette, Braces, ChevronDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Template fields available for insertion
const TEMPLATE_FIELDS = [
  { 
    category: 'Reservation',
    fields: [
      { value: '{{reservation_reference}}', label: 'Reservation Reference', description: 'Unique booking reference number (e.g., ABC12345)' },
      { value: '{{total_amount}}', label: 'Total Amount', description: 'Total booking cost formatted with currency (e.g., R 2,500.00)' },
      { value: '{{check_in_date}}', label: 'Check-in Date', description: 'Formatted arrival date (e.g., Monday, 25 December 2025)' },
      { value: '{{check_out_date}}', label: 'Check-out Date', description: 'Formatted departure date (e.g., Friday, 29 December 2025)' },
      { value: '{{nights}}', label: 'Number of Nights', description: 'Total nights of stay (e.g., 4 nights)' },
      { value: '{{total_guests}}', label: 'Total Guests', description: 'Combined count of all guests (adults + teens + children + infants)' },
    ]
  },
  {
    category: 'Guest Details',
    fields: [
      { value: '{{guest_name}}', label: 'Guest Name', description: 'Full name of the primary guest' },
      { value: '{{guest_email}}', label: 'Guest Email', description: 'Email address of the guest' },
      { value: '{{guest_phone}}', label: 'Guest Phone', description: 'Phone number (if provided)' },
      { value: '{{special_requests}}', label: 'Special Requests', description: 'Any special requests noted by the guest' },
    ]
  },
  {
    category: 'Property Details',
    fields: [
      { value: '{{property_name}}', label: 'Property Name', description: 'Name of the booked property' },
      { value: '{{property_city}}', label: 'City', description: 'City where the property is located' },
      { value: '{{property_country}}', label: 'Country', description: 'Country where the property is located' },
      { value: '{{property_address}}', label: 'Full Address', description: 'Complete property address' },
    ]
  },
  {
    category: 'Room Details',
    fields: [
      { value: '{{room_type_name}}', label: 'Room Type', description: 'Name of the booked room type (e.g., Deluxe Suite)' },
      { value: '{{rate_type_name}}', label: 'Rate Type', description: 'Selected rate plan (e.g., Bed & Breakfast)' },
      { value: '{{adults}}', label: 'Adults', description: 'Number of adult guests' },
      { value: '{{teens}}', label: 'Teens', description: 'Number of teen guests' },
      { value: '{{children}}', label: 'Children', description: 'Number of child guests' },
      { value: '{{infants}}', label: 'Infants', description: 'Number of infant guests' },
    ]
  },
];

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const RichTextEditor = ({ content, onChange, placeholder }: RichTextEditorProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      TextStyle,
      Color,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[150px] p-3 focus:outline-none text-foreground',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data, error } = await supabase.storage
        .from('template-images')
        .upload(fileName, file);

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('template-images')
        .getPublicUrl(data.path);

      editor?.chain().focus().setImage({ src: urlData.publicUrl }).run();
      toast.success('Image uploaded');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setLink = () => {
    if (linkUrl) {
      editor?.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
      setLinkUrl('');
    } else {
      editor?.chain().focus().unsetLink().run();
    }
  };

  const insertTemplateField = (field: string) => {
    editor?.chain().focus().insertContent(field).run();
  };

  if (!editor) return null;

  const ToolbarButton = ({ onClick, active, disabled, children, title }: {
    onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode; title: string;
  }) => (
    <Button
      type="button"
      variant={active ? 'default' : 'ghost'}
      size="icon"
      className="h-6 w-6"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </Button>
  );

  const colors = ['#000000', '#374151', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#0891B2', '#2563EB', '#7C3AED', '#DB2777'];

  return (
    <div className="border rounded-md bg-background">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b bg-muted/30">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough className="h-3 w-3" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <AlignLeft className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <AlignCenter className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <AlignRight className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
          <AlignJustify className="h-3 w-3" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          <List className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
          <ListOrdered className="h-3 w-3" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Text Color">
              <Palette className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="flex flex-wrap gap-1 max-w-[120px]">
              {colors.map(color => (
                <button
                  key={color}
                  type="button"
                  className="w-5 h-5 rounded border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant={editor.isActive('link') ? 'default' : 'ghost'} size="icon" className="h-6 w-6" title="Link">
              <LinkIcon className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2">
            <div className="flex gap-1">
              <Input
                type="url"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="h-7 text-xs"
              />
              <Button type="button" size="sm" className="h-7 text-xs" onClick={setLink}>
                {linkUrl ? 'Set' : 'Remove'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <ToolbarButton 
          onClick={() => fileInputRef.current?.click()} 
          disabled={uploading} 
          title="Insert Image"
        >
          <ImageIcon className="h-3 w-3" />
        </ToolbarButton>

        <div className="w-px h-4 bg-border mx-1" />

        {/* Template Fields Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" title="Insert Template Field">
              <Braces className="h-3 w-3" />
              <span className="hidden sm:inline">Fields</span>
              <ChevronDown className="h-2.5 w-2.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80 max-h-[400px] overflow-y-auto bg-popover z-50" align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Click to insert a field into your template
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {TEMPLATE_FIELDS.map((category, idx) => (
              <DropdownMenuGroup key={category.category}>
                {idx > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs font-semibold">{category.category}</DropdownMenuLabel>
                {category.fields.map((field) => (
                  <DropdownMenuItem
                    key={field.value}
                    onClick={() => insertTemplateField(field.value)}
                    className="flex flex-col items-start gap-0.5 cursor-pointer py-2"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{field.value}</code>
                      <span className="text-xs font-medium">{field.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground leading-tight">{field.description}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-4 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          <Undo className="h-3 w-3" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          <Redo className="h-3 w-3" />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
    </div>
  );
};

export default RichTextEditor;
