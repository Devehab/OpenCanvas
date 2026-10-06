// Starter tools: the smallest useful OpenCanvas plugin.
// Four commands, each a few lines, that show the basics of the plugin API:
// reading the page, inserting elements, running an editor command, updating
// the selection and showing a message. Runs in the plugin sandbox;
// `opencanvas` is the plugin API.

const ar = opencanvas.locale === 'ar';

/** Picks the message in the editor's language. */
const say = (en, arabic) => (ar ? arabic : en);

const COLORS = ['#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#4f46e5'];
const BACKGROUNDS = ['#fef3c7', '#fce7f3', '#ede9fe', '#dbeafe', '#dcfce7', '#ffedd5', '#f1f5f9', '#1e1b4b'];

/** A random item of a list, different from `not` when possible. */
function pick(list, not) {
  const choices = list.filter((item) => item !== not);
  return choices[Math.floor(Math.random() * choices.length)];
}

// 1. Add a title: a text box across the top of the current page.
opencanvas.commands.register('add-title', async () => {
  const { page } = await opencanvas.design.page();
  const width = Math.round(page.width * 0.8);
  const fontSize = Math.max(24, Math.round(Math.min(page.width, page.height) / 10));
  const [id] = await opencanvas.design.insert([
    {
      type: 'text',
      name: say('Title', 'عنوان'),
      x: Math.round((page.width - width) / 2),
      y: Math.round(page.height * 0.1),
      width,
      sizing: 'auto-height',
      align: 'center',
      content: {
        paragraphs: [
          { runs: [{ text: say('Your title here', 'اكتب عنوانك هنا'), style: {} }], list: 'none', indent: 0 },
        ],
      },
      style: { fontFamily: 'Cairo', fontSize, fontWeight: 800, color: '#111827' },
    },
  ]);
  await opencanvas.design.select([id]);
});

// 2. Random background: runs the editor's own `page.update` command.
opencanvas.commands.register('random-background', async (context) => {
  const { page } = await opencanvas.design.page(context.pageId);
  const current = page.background?.type === 'solid' ? page.background.color : undefined;
  const color = pick(BACKGROUNDS, current);
  await opencanvas.design.execute('page.update', {
    id: page.id,
    patch: { background: { type: 'solid', color } },
  });
});

// 3. Count elements: reads the page and shows a message. Changes nothing.
opencanvas.commands.register('count-elements', async (context) => {
  const { nodes } = await opencanvas.design.page(context.pageId);
  const count = nodes.length;
  await opencanvas.ui.toast(
    say(
      count === 1 ? 'This page has 1 element.' : `This page has ${count} elements.`,
      count === 0
        ? 'لا توجد عناصر في هذه الصفحة.'
        : count === 1
          ? 'في هذه الصفحة عنصر واحد.'
          : count === 2
            ? 'في هذه الصفحة عنصران.'
            : count <= 10
              ? `في هذه الصفحة ${count} عناصر.`
              : `في هذه الصفحة ${count} عنصرًا.`,
    ),
    'info',
  );
});

// 4. Recolor shapes: gives every selected shape a new solid fill.
opencanvas.commands.register('recolor-shapes', async () => {
  const selected = await opencanvas.design.selection();
  const shapes = selected.filter((node) => node.type === 'shape');
  if (shapes.length === 0)
    throw new Error(say('Select one or more shapes first.', 'حدّد شكلًا واحدًا أو أكثر أولًا.'));
  for (const shape of shapes) {
    const current = shape.fill?.type === 'solid' ? shape.fill.color : undefined;
    await opencanvas.design.update([shape.id], { fill: { type: 'solid', color: pick(COLORS, current) } });
  }
  await opencanvas.ui.toast(say('Shapes recolored.', 'تغيّرت ألوان الأشكال.'), 'success');
});
