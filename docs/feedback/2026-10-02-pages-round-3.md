# Pages, round 3: things to try

Phases 3 and 4: drawing, pictures, Pages layout, printing and share links, plus the small fixes left over from phase 2. Try each one and write a note under it: ✅ fine, ❌ broken (what happened), or ✏️ change it (how). Then send the whole file back. The round 2 list is still open too.

**Before you start:** run `npx supabase db push` once. It adds the `sheet_ink` table and lets pages be shared. Until then, drawing still works but stays on this device. Sharing a page shows an error.

## Drawing

1. **Pen.** Press **P** or pick the pen in the bottom bar. Draw anywhere, over the paper or over text. A bar above the tools has three colour slots. Click the one in use to change its colour.
   - Notes:
2. **Thickness and feel.** Pick a dot for thin, medium or thick. The cog has a thickness slider, smoothing, pressure, and "hold to make a shape".
   - Notes:
3. **Hold to make a shape.** Draw a rough box, circle, triangle or line and keep the pen still at the end for half a second. It snaps into a clean shape with its corners on the grid. Hold Alt to keep it off the grid.
   - Notes:
4. **Highlighter.** Press **M**. A stroke along a line of text straightens onto that line and sits behind the text. Pick one of four colours.
   - Notes:
5. **Eraser.** Press **E**. "Whole strokes" removes any stroke you touch. "Rub out" removes only the part you rub over and leaves the rest. Three sizes.
   - Notes:
6. **Lasso.** Press **L** and draw around drawing and blocks. Then drag the dashed frame to move them, or use the bar to duplicate, recolour or delete. "Ask Gemini" shows but stays off until AI is added.
   - Notes:
7. **Drawing sticks to its block.** Draw over a block, then move it by its grip, duplicate it, and delete it and press Ctrl+Z. The drawing should go wherever the block goes. Drawing on empty paper stays where it is.
   - Notes:
8. **Undo covers everything.** Ctrl+Z and Ctrl+Shift+Z undo and redo strokes, erasing and block moves in the order you did them.
   - Notes:
9. **Read view** (top bar) shows drawing on its block.
   - Notes:
10. **Tablet or touchscreen with a pen**, if you have one. Once you've used the pen, a resting hand doesn't draw and one finger moves the page. You can change this under the pen's cog → "Only the pen draws". A quick two-finger tap undoes.
    - Notes:

## Pictures

11. **Add a picture.** Paste one (a screenshot works), drag a file onto a block or the paper, or use Insert → **Picture** (letter **M** in the Insert panel). It's shrunk to 2000 px and kept on this device.
    - Notes:
12. **Resize, caption, alt text.** Drag the corner dot to resize. Its height rounds to whole lines, so text below stays on the lines. Click it to add a caption. Use **Add alt text** in its bar to describe it.
    - Notes:
13. **Imgur.** Uploading needs a free Imgur client id, which this build doesn't have yet. Until it has one, pictures say "On this device only". Once it's set, the first picture asks you to agree that Imgur hosts it, with a checkbox. Is that the wording you want?
    - Notes:

## Pages layout and printing

14. **Pages layout.** Go to ⋯ → Page settings → Layout → **Pages**, then pick A4 or Letter and switch page numbers on. The main column now sits on sheets. Write past the bottom of one and the next paragraph, table or plot moves whole to the next sheet.
    - Notes:
15. **Print and Save as PDF.** Use ⋯ → **Print…** or **Save as PDF…**, or press Ctrl+P. In Pages layout only the main column prints. Pageless, the blocks beside it print after the line they start on. Text in the PDF stays selectable.
    - Notes:

## Sharing

16. **Share a page.** Use ⋯ → **Share…** → Create a link, then open it in a private window. You get a read-only copy, and **Include my drawing** decides whether the pen and highlighter come along. Signed in, "Save to my library" makes your own copy.
    - Notes:

## Small fixes from phase 2

17. **Keyboard.** Tab to a block's grip and use the arrow keys to move it (Shift moves 4 lines). Enter selects it and Delete removes it. Bookmarks work the same way, and Enter renames one. A rendered equation or plot opens with Enter.
    - Notes:
18. **A selected link card** isn't replaced when you type. The text goes after it.
    - Notes:
19. **An empty quote or code block** left in a side block is cleared when you click away, like an empty line.
    - Notes:
20. **Folder cards** in the Library count pages too.
    - Notes:
