import { Group, Paper, Skeleton, Stack } from "@mantine/core";
import BackButton from "@/components/BackButton";

export default function CurriculumDetailLoading() {
  return (
    <>
      <h1 className="text-3xl font-bold mb-6 text-[#597D37]">Curriculum</h1>

      <Stack gap="md">
        {/* Back button + title row */}
        <div>
          <BackButton href="/school/curriculum" mb="md" size="sm">
            Back to Curriculum Menu
          </BackButton>
          <Group justify="space-between" align="center">
            <Skeleton height={28} width={260} radius="sm" />
            <Group gap="xs">
              <Skeleton height={34} width={138} radius="md" />
              <Skeleton height={34} width={152} radius="md" />
            </Group>
          </Group>
        </div>

        {/* About paper */}
        <Paper withBorder p="md" radius="md" w={{ base: "100%", md: "50%" }}>
          <Skeleton height={18} width={52} radius="sm" mb="sm" />
          <Stack gap={10}>
            <Skeleton height={14} width="70%" radius="sm" />
            <Skeleton height={14} width="55%" radius="sm" />
            <Skeleton height={14} width="45%" radius="sm" />
          </Stack>
        </Paper>

        {/* Subject Groups collapsible header (collapsed by default) */}
        <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", backgroundColor: "#F5F5F5" }}>
            <Skeleton height={18} width={130} radius="sm" />
          </div>
        </Paper>

        {/* Grade level collapsible headers (collapsed by default) */}
        {[100, 80, 90, 85].map((w, i) => (
          <Paper key={i} withBorder radius="md" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 20px" }}>
              <Skeleton height={18} width={w} radius="sm" />
            </div>
          </Paper>
        ))}
      </Stack>
    </>
  );
}
