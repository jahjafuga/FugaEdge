// @vitest-environment jsdom
//
// The reusable presentational Avatar — the 3-tier fallback extracted from
// AvatarPicker so the picker and the account-menu trigger render the SAME disc.
// Pure: no IPC, no fetch. avatarData → <img> · else initials → disc · else glyph.

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Avatar from '../Avatar'

describe('Avatar — 3-tier fallback', () => {
  it('renders the image when avatarData is present', () => {
    const { container } = render(
      <Avatar avatarData="data:image/jpeg;base64,abc123" initials="JF" />,
    )
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toContain('data:image/jpeg')
    expect(screen.queryByText('JF')).toBeNull() // image wins over initials
  })

  it('renders initials when no avatarData but initials present', () => {
    const { container } = render(<Avatar avatarData={null} initials="JF" />)
    expect(screen.getByText('JF')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders the User glyph when neither avatarData nor initials', () => {
    const { container } = render(<Avatar avatarData={null} initials={null} />)
    expect(container.querySelector('svg')).toBeTruthy() // lucide <User/>
    expect(container.querySelector('img')).toBeNull()
  })

  it('passes through testId to the disc root', () => {
    render(<Avatar avatarData={null} initials="JF" testId="avatar-disc" />)
    expect(screen.getByTestId('avatar-disc')).toBeTruthy()
  })
})
