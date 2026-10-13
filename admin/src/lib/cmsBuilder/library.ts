import { BuilderNode, BuilderNodeType, newNodeId } from './types';

export type BuilderLibraryItem = {
  type: BuilderNodeType | 'hero' | 'cards' | 'services' | 'cta' | 'faq';
  label: string;
  category: 'layout' | 'content' | 'media' | 'convert' | 'structure';
  hint: string;
};

export const BUILDER_LIBRARY: BuilderLibraryItem[] = [
  { type: 'hero', label: 'Hero', category: 'layout', hint: 'Lead section with CTA' },
  { type: 'frame', label: 'Section', category: 'layout', hint: 'Page section frame' },
  { type: 'stack', label: 'Stack', category: 'layout', hint: 'Vertical / horizontal stack' },
  { type: 'grid', label: 'Grid', category: 'layout', hint: 'Responsive grid' },
  { type: 'cards', label: 'Cards', category: 'content', hint: 'Card group' },
  { type: 'services', label: 'Services', category: 'content', hint: 'Service cards' },
  { type: 'heading', label: 'Heading', category: 'content', hint: 'Title text' },
  { type: 'text', label: 'Text', category: 'content', hint: 'Body copy' },
  { type: 'button', label: 'Button', category: 'convert', hint: 'Call to action' },
  { type: 'cta', label: 'CTA block', category: 'convert', hint: 'Headline + button' },
  { type: 'card', label: 'Card', category: 'content', hint: 'Single card' },
  { type: 'image', label: 'Image', category: 'media', hint: 'Image block' },
  { type: 'form', label: 'Form', category: 'convert', hint: 'Lead form' },
  { type: 'faq', label: 'FAQ', category: 'content', hint: 'Question list' },
  { type: 'header', label: 'Header', category: 'structure', hint: 'Fixed site header' },
  { type: 'nav', label: 'Navigation', category: 'structure', hint: 'Fixed nav' },
  { type: 'footer', label: 'Footer', category: 'structure', hint: 'Fixed site footer' },
  { type: 'spacer', label: 'Spacer', category: 'layout', hint: 'Vertical space' },
  { type: 'embed', label: 'Embed', category: 'media', hint: 'External embed' },
];

function heading(text: string, size = '1.85rem'): BuilderNode {
  return {
    id: newNodeId(),
    type: 'heading',
    name: 'Heading',
    props: { text, role: 'title' },
    style: { fontSize: size, fontWeight: '700' },
  };
}

function body(text: string): BuilderNode {
  return {
    id: newNodeId(),
    type: 'text',
    name: 'Text',
    props: { text, role: 'body' },
    style: { fontSize: '1rem', lineHeight: '1.55' },
  };
}

function button(label: string, href = '#'): BuilderNode {
  return {
    id: newNodeId(),
    type: 'button',
    name: 'Button',
    props: { text: label, href },
    style: {
      backgroundColor: 'var(--cms-primary)',
      color: '#fff',
      padding: '0.7rem 1.2rem',
      borderRadius: '10px',
      fontWeight: '600',
    },
  };
}

function card(title: string, detail: string): BuilderNode {
  return {
    id: newNodeId(),
    type: 'card',
    name: title,
    style: {
      display: 'flex',
      direction: 'column',
      gap: '0.45rem',
      padding: '1.1rem',
      borderRadius: '14px',
      cardColor: 'var(--cms-card)',
      backgroundColor: 'var(--cms-card)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
    },
    children: [heading(title, '1.1rem'), body(detail)],
  };
}

export function createLibraryNode(type: BuilderLibraryItem['type']): BuilderNode {
  switch (type) {
    case 'hero':
      return {
        id: newNodeId(),
        type: 'frame',
        name: 'Hero',
        style: {
          display: 'flex',
          direction: 'column',
          align: 'center',
          gap: '0.85rem',
          padding: '3.25rem 2rem',
          textAlign: 'center',
          width: '100%',
        },
        children: [
          heading('New hero', 'clamp(2rem,4vw,3rem)'),
          body('Supporting line that explains your offer.'),
          button('Learn more'),
        ],
      };
    case 'cta':
      return {
        id: newNodeId(),
        type: 'frame',
        name: 'CTA',
        style: {
          display: 'flex',
          direction: 'column',
          align: 'center',
          gap: '0.75rem',
          padding: '2.5rem 1.75rem',
          textAlign: 'center',
          width: '100%',
          backgroundColor: 'rgba(11,61,46,0.06)',
        },
        children: [heading('Call to action'), body('Invite visitors to take the next step.'), button('Contact us')],
      };
    case 'cards':
    case 'services':
      return {
        id: newNodeId(),
        type: 'frame',
        name: type === 'services' ? 'Services' : 'Cards',
        style: {
          display: 'flex',
          direction: 'column',
          gap: '1rem',
          padding: '2.1rem 1.75rem',
          width: '100%',
        },
        children: [
          heading(type === 'services' ? 'Services' : 'Cards'),
          {
            id: newNodeId(),
            type: 'grid',
            name: 'Card grid',
            style: { display: 'grid', gridColumns: 3, gap: '1rem', width: '100%' },
            children: [
              card('First item', 'Short description'),
              card('Second item', 'Short description'),
              card('Third item', 'Short description'),
            ],
          },
        ],
      };
    case 'faq':
      return {
        id: newNodeId(),
        type: 'frame',
        name: 'FAQ',
        style: { display: 'flex', direction: 'column', gap: '0.85rem', padding: '2.1rem 1.75rem', width: '100%' },
        children: [
          heading('FAQs'),
          {
            id: newNodeId(),
            type: 'stack',
            name: 'Questions',
            style: { display: 'flex', direction: 'column', gap: '0.65rem', width: '100%' },
            children: [
              card('Example question?', 'Example answer.'),
              card('Another question?', 'Another answer.'),
            ],
          },
        ],
      };
    case 'header':
      return {
        id: newNodeId(),
        type: 'header',
        name: 'Header',
        chrome: true,
        style: {
          display: 'flex',
          direction: 'row',
          justify: 'between',
          align: 'center',
          padding: '0.95rem 1.35rem',
          backgroundColor: 'var(--cms-primary)',
          color: '#fff',
          width: '100%',
        },
        children: [
          heading('Site name', '1.05rem'),
          body('Home · About · Contact'),
        ],
      };
    case 'nav':
      return {
        id: newNodeId(),
        type: 'nav',
        name: 'Navigation',
        chrome: true,
        style: {
          display: 'flex',
          direction: 'row',
          justify: 'between',
          align: 'center',
          padding: '0.75rem 1.25rem',
          backgroundColor: 'var(--cms-primary)',
          color: '#fff',
          width: '100%',
        },
        children: [heading('Menu', '0.95rem'), body('Home · About · Services · Contact')],
      };
    case 'footer':
      return {
        id: newNodeId(),
        type: 'footer',
        name: 'Footer',
        chrome: true,
        style: {
          display: 'flex',
          direction: 'column',
          align: 'center',
          gap: '0.35rem',
          padding: '1.5rem',
          textAlign: 'center',
          width: '100%',
          backgroundColor: 'rgba(0,0,0,0.04)',
        },
        children: [heading('Footer', '1rem'), body('© Your organisation · Privacy · Contact')],
      };
    case 'stack':
      return {
        id: newNodeId(),
        type: 'stack',
        name: 'Stack',
        style: { display: 'flex', direction: 'column', gap: '0.75rem', padding: '1rem', width: '100%' },
        children: [heading('Stack'), body('Add nested blocks here.')],
      };
    case 'grid':
      return {
        id: newNodeId(),
        type: 'grid',
        name: 'Grid',
        style: { display: 'grid', gridColumns: 3, gap: '1rem', padding: '1rem', width: '100%' },
        children: [card('One', 'Item'), card('Two', 'Item'), card('Three', 'Item')],
      };
    case 'frame':
      return {
        id: newNodeId(),
        type: 'frame',
        name: 'Section',
        style: { display: 'flex', direction: 'column', gap: '0.75rem', padding: '2.1rem 1.75rem', width: '100%' },
        children: [heading('Section'), body('Add your content.')],
      };
    case 'card':
      return card('Card title', 'Card body copy.');
    case 'heading':
      return heading('Heading');
    case 'text':
      return body('Add your content.');
    case 'button':
      return button('Learn more');
    case 'image':
      return {
        id: newNodeId(),
        type: 'image',
        name: 'Image',
        props: { imagePath: null, imageAlt: '' },
        style: { width: '100%', minHeight: '180px', borderRadius: '12px', backgroundColor: 'rgba(0,0,0,0.06)' },
      };
    case 'form':
      return {
        id: newNodeId(),
        type: 'form',
        name: 'Form',
        style: { display: 'flex', direction: 'column', gap: '0.55rem', padding: '1.25rem', width: '100%', maxWidth: '480px' },
        children: [
          heading('Contact form', '1.25rem'),
          body('Name'),
          body('Email'),
          body('Message'),
          button('Send'),
        ],
      };
    case 'spacer':
      return {
        id: newNodeId(),
        type: 'spacer',
        name: 'Spacer',
        style: { minHeight: '2.5rem', width: '100%' },
      };
    case 'embed':
      return {
        id: newNodeId(),
        type: 'embed',
        name: 'Embed',
        props: { text: 'https://example.com/embed' },
        style: { padding: '1.5rem', backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: '12px', width: '100%' },
      };
    default:
      return body('Block');
  }
}
