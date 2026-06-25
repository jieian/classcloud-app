import type { Metadata } from "next";
import { Box, Container, Divider, Group, Paper, Stack } from "@mantine/core";
import BackButton from "@/components/BackButton";
import PrivacyNoticeContent from "./_components/PrivacyNoticeContent";

export const metadata: Metadata = {
  title: "Privacy Notice — ClassCloud",
  description:
    "How ClassCloud collects, uses, discloses, protects, and retains personal data, and your rights as a data subject under the Data Privacy Act of 2012 (Republic Act No. 10173).",
};

export default function PrivacyNoticePage() {
  return (
    <Box bg="#f0f7ee" mih="100vh" py={{ base: "lg", sm: 48 }}>
      <Container size="md">
        <Paper
          withBorder
          radius="lg"
          p={{ base: "md", sm: 40 }}
          bg="white"
          style={{ borderColor: "#d3e9d0" }}
        >
          <Stack gap="xs">
            <PrivacyNoticeContent />
            <Divider my="lg" color="#d3e9d0" />
            <Group justify="center">
              <BackButton href="/login">Back to Login</BackButton>
            </Group>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
