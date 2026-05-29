'use client';

import { useMediaQuery } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import styles from './NotificationsPosition.module.css';

export default function AppNotifications() {
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <Notifications
      position={isMobile ? 'top-center' : 'top-right'}
      classNames={{ root: styles.notifications }}
      zIndex={1800}
    />
  );
}
