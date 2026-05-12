# Images Needed

Drop all client-provided images into this folder before deploying.

## Required

| Filename | Used in | Notes |
|---|---|---|
| `logo.png` | Header, Footer | PNG with transparent background preferred |
| `og-image.jpg` | Social sharing meta tag | 1200×630px, shows when link is shared |
| `hero.jpg` | Home page hero background | Best project photo, landscape orientation |
| `about-photo.jpg` | Home page about section | Project or owner photo |
| `owner-photo.jpg` | About page | Owner portrait or on-the-job photo |

## Project Photos (Gallery + Services)

Name files descriptively so they're easy to reference in code:
- `kitchen-1.jpg`, `kitchen-2.jpg`
- `bathroom-1.jpg`
- `fence-1.jpg`
- etc.

Update the `photos` array in `src/app/gallery/page.tsx` and
the `image` fields in `src/app/services/page.tsx` to match the actual filenames.

## Tips

- JPG for photos, PNG for logo
- Resize photos to max 1920px wide before adding (keeps the repo small)
- Use descriptive filenames — they don't show publicly but help keep things organized
