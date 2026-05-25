import { Box, Group, SimpleGrid, Skeleton, Stack } from "@mantine/core";

const skeletonGroups = [
  { labelWidth: 112, cards: 1 },
  { labelWidth: 124, cards: 4 },
  { labelWidth: 136, cards: 3 },
];

export default function ClassesSkeleton() {
  return (
    <>
      {/* Accordion sections */}
      <Stack gap="md">
        {skeletonGroups.map((group, index) => (
          <Box
            key={index}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <Box px="md" py="sm" style={{ backgroundColor: "#f3f4f6" }}>
              <Group gap="xs">
                <Skeleton height={18} width={group.labelWidth} radius="sm" />
                <Skeleton height={14} width={28} radius="sm" />
              </Group>
            </Box>
            <Box p="sm">
              <SimpleGrid
                cols={{ base: 1, sm: 2, md: 3, xl: 4 }}
                spacing="sm"
              >
                {Array.from({ length: group.cards }).map((_, cardIndex) => (
                  <Skeleton key={cardIndex} height={170} radius="md" />
                ))}
              </SimpleGrid>
            </Box>
          </Box>
        ))}
      </Stack>
    </>
  );
}
