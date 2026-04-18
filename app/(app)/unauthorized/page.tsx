"use client";

import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

export default function UnauthorizedPage() {
  const router = useRouter();

  return (
    <Center h="70vh">
      <Stack align="center" gap="md">
        <IconLock size={48} color="#808898" stroke={1.5} />
        <Title order={2} c="#597D37">
          Access Denied
        </Title>
        <Text c="#808898" ta="center" maw={400}>
          You don&apos;t have permission to view this page. Contact your
          administrator if you think this is a mistake.
        </Text>
        <Button
          variant="outline"
          color="#4EAE4A"
          onClick={() => router.replace("/")}
        >
          Go to Home
        </Button>
      </Stack>
    </Center>
  );
}
