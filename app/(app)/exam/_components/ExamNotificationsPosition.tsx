'use client';

import { usePathname } from 'next/navigation';
import { useMediaQuery } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import styles from './ExamNotificationsPosition.module.css';

export default function DynamicNotifications() {
  const pathname = usePathname();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isExam = pathname.startsWith('/exam');

  return (
    <Notifications
      position={isExam ? (isMobile ? 'top-center' : 'top-right') : 'bottom-right'}
      classNames={isExam ? { root: styles.examNotifications } : undefined}
      zIndex={isExam ? 1800 : undefined}
    />
  );
}
