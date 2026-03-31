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
export default function BackButton({ href, onClick, size = 'xs', children, ...props }: BackButtonProps) {
  const common: ButtonProps = {
    variant: 'default',
    leftSection: <IconArrowLeft size={12} />,
    size,
    w: 'fit-content',
    ...props,
  };

  if (href) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <Button {...common} component={Link as any} href={href}>{children}</Button>;
  }

  return <Button {...common} onClick={onClick}>{children}</Button>;
}
