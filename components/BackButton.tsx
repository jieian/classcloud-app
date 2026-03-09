'use client';

import { Button } from '@mantine/core';
import type { ButtonProps } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import Link from 'next/link';

type BackButtonProps = Omit<ButtonProps, 'variant' | 'color' | 'leftSection'> & {
  href?: string;
  onClick?: () => void;
};

/**
 * Standardized back navigation button used across the app.
 * Pass `href` for link-based navigation, or `onClick` for programmatic navigation.
 */
export default function BackButton({ href, onClick, size = 'md', children, ...props }: BackButtonProps) {
  const common: ButtonProps = {
    variant: 'filled',
    color: '#466D1D',
    leftSection: <IconArrowLeft size={16} />,
    size,
    ...props,
  };

  if (href) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <Button {...common} component={Link as any} href={href}>{children}</Button>;
  }

  return <Button {...common} onClick={onClick}>{children}</Button>;
}
