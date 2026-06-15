import type { Metadata } from "next";
import {
  Anchor,
  Box,
  Container,
  Group,
  List,
  ListItem,
  Paper,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import {
  PRIVACY_NOTICE_VERSION,
  SUB_PROCESSORS,
  RETENTION_SCHEDULE,
  DPO_CONTACT,
} from "@/lib/privacy";
import BackButton from "@/components/BackButton";

export const metadata: Metadata = {
  title: "Privacy Notice — ClassCloud",
  description:
    "How ClassCloud collects, uses, protects, and retains personal data, and your rights under the Data Privacy Act of 2012 (RA 10173).",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Title order={2} fz={{ base: "lg", sm: "xl" }} c="#2f5d2b" mt="lg">
      {children}
    </Title>
  );
}

export default function PrivacyNoticePage() {
  return (
    <Box bg="#f0f7ee" mih="100vh" py={{ base: "lg", sm: 48 }}>
      <Container size="md">
        <Paper withBorder radius="lg" p={{ base: "md", sm: 40 }} bg="white" style={{ borderColor: "#d3e9d0" }}>
          <Stack gap="xs">
            <Title order={1} fz={{ base: "h2", sm: "h1" }} c="#2f5d2b">
              Privacy Notice
            </Title>
            <Text size="sm" c="#808898">
              Version {PRIVACY_NOTICE_VERSION} · In accordance with the Data Privacy Act of 2012
              (Republic Act No. 10173), its IRR, and applicable National Privacy Commission (NPC) issuances.
            </Text>

            <Text mt="sm" size="sm" c="#3a3f4a">
              This notice explains how <strong>ClassCloud</strong>, operated for{" "}
              {DPO_CONTACT.organization}, collects, uses, discloses, protects, and retains personal
              information, and the rights available to you as a data subject. The school is the{" "}
              <strong>Personal Information Controller (PIC)</strong>.
            </Text>

            <SectionTitle>1. Personal data we collect</SectionTitle>
            <Text size="sm" c="#3a3f4a">
              We practice <strong>data minimization</strong> and collect only what is operationally
              necessary:
            </Text>
            <List size="sm" spacing={4} c="#3a3f4a">
              <ListItem>
                <strong>Students (learners):</strong> Learner Reference Number (LRN), name, sex, and
                assessment scores. We deliberately do <em>not</em> collect address, parents&apos; names,
                religion, or health/disability information — even though the official School Form 1 (SF1)
                includes those fields.
              </ListItem>
              <ListItem>
                <strong>Staff &amp; faculty:</strong> name, email address, assigned roles, and account
                security data (managed by our authentication provider).
              </ListItem>
              <ListItem>
                <strong>Activity records:</strong> audit logs of security and academic actions for
                accountability.
              </ListItem>
            </List>
            <Text size="sm" c="#3a3f4a">
              ClassCloud does not collect <strong>sensitive personal information</strong> as enumerated
              in Section 3 of RA 10173.
            </Text>

            <SectionTitle>2. Purpose and legal basis</SectionTitle>
            <Text size="sm" c="#3a3f4a">
              Personal data is processed to manage classes and enrolment, generate periodical test
              reports and item analysis, and administer user accounts — in furtherance of the school&apos;s
              educational mandate and its reporting obligations to the Department of Education. Processing
              of learners&apos; data is carried out by authorized school staff; consent for the processing
              of a learner&apos;s data is obtained by the school through its enrolment process.
            </Text>

            <SectionTitle>3. How we protect your data (Sec. 20)</SectionTitle>
            <List size="sm" spacing={4} c="#3a3f4a">
              <ListItem>Encryption in transit (HTTPS) and at rest at the database layer.</ListItem>
              <ListItem>Role-based access control with a database-level &quot;active staff only&quot; read guard.</ListItem>
              <ListItem>Append-only audit logging, rate limiting, and bot/abuse protection.</ListItem>
              <ListItem>Need-to-know access: staff see only the records within their assigned scope.</ListItem>
            </List>

            <SectionTitle>4. Sharing &amp; cross-border transfer</SectionTitle>
            <Text size="sm" c="#3a3f4a">
              We do not sell personal data. We engage the following sub-processors, which may process
              data outside the Philippines under appropriate safeguards:
            </Text>
            <Table mt={4} striped withTableBorder withColumnBorders fz="sm">
              <TableThead>
                <TableTr>
                  <TableTh>Provider</TableTh>
                  <TableTh>Purpose</TableTh>
                  <TableTh>Location</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {SUB_PROCESSORS.map((sp) => (
                  <TableTr key={sp.name}>
                    <TableTd>{sp.name}</TableTd>
                    <TableTd>{sp.purpose}</TableTd>
                    <TableTd>{sp.region}</TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>

            <SectionTitle>5. Retention</SectionTitle>
            <Table mt={4} striped withTableBorder withColumnBorders fz="sm">
              <TableThead>
                <TableTr>
                  <TableTh>Record type</TableTh>
                  <TableTh>Retention period</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {RETENTION_SCHEDULE.map((r) => (
                  <TableTr key={r.record}>
                    <TableTd>{r.record}</TableTd>
                    <TableTd>{r.period}</TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>

            <SectionTitle>6. Your rights as a data subject (Sec. 16–18)</SectionTitle>
            <Text size="sm" c="#3a3f4a">
              You have the right to be informed, to access, to rectification (correction), to erasure or
              blocking, to object, to data portability, to file a complaint, and to damages. To exercise
              any of these rights, contact the Data Protection Officer below. Account deletion is
              administered by the school subject to its records-retention obligations.
            </Text>

            <SectionTitle>7. Contact &amp; complaints</SectionTitle>
            <Text size="sm" c="#3a3f4a">
              {DPO_CONTACT.role}, {DPO_CONTACT.organization} —{" "}
              <Anchor href={`mailto:${DPO_CONTACT.email}`} c="#4EAE4A">
                {DPO_CONTACT.email}
              </Anchor>
              . You may also lodge a complaint with the National Privacy Commission ({" "}
              <Anchor href="https://privacy.gov.ph" target="_blank" rel="noopener noreferrer" c="#4EAE4A">
                privacy.gov.ph
              </Anchor>
              ).
            </Text>

            <Group justify="center" mt="xl">
              <BackButton href="/login">Back to Login</BackButton>
            </Group>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
