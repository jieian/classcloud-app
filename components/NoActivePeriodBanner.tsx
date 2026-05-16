import { Center, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCalendarOff } from "@tabler/icons-react";

interface NoActivePeriodBannerProps {
  title?: string;
  description?: string;
}

export default function NoActivePeriodBanner({
  title = "No School Year or Term activated.",
  description = "Please contact an Administrator to activate an academic period.",
}: NoActivePeriodBannerProps) {
  return (
    <Center
      py={36}
      px="md"
      style={{
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: "8px",
        backgroundColor: "#FFFFFF",
      }}
    >
      <Stack gap={10} align="center">
        <ThemeIcon size={48} radius="xl" color="gray.2" variant="filled" mb="sm">
          <IconCalendarOff size={28} stroke={1.5} color="#3D4147" />
        </ThemeIcon>
        <Stack gap={4} align="center">
          <Text size="md" fw={700} c="#111827" mb="sm">
            {title}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {description}
          </Text>
        </Stack>
      </Stack>
    </Center>
  );
}
