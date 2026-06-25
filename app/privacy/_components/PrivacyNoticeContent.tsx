import {
  Anchor,
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
  DATA_CATEGORIES,
  DATA_SUBJECT_RIGHTS,
  DPO_CONTACT,
  KEY_DEFINITIONS,
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_NOTICE_VERSION,
  PROCESSING_PURPOSES,
  RETENTION_SCHEDULE,
  SUB_PROCESSORS,
} from "@/lib/privacy";

const SECTIONS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "definitions", label: "Key terms" },
  { id: "data-we-collect", label: "Personal data we collect" },
  { id: "sensitive", label: "Sensitive personal information" },
  { id: "purposes", label: "Purposes of processing" },
  { id: "legal-basis", label: "Lawful basis" },
  { id: "minors", label: "Learners & minors" },
  { id: "sharing", label: "Disclosure & sub-processors" },
  { id: "retention", label: "Retention & disposal" },
  { id: "security", label: "Security measures" },
  { id: "breach", label: "Breach notification" },
  { id: "cookies", label: "Cookies & analytics" },
  { id: "automated", label: "Automated decision-making" },
  { id: "rights", label: "Your rights" },
  { id: "exercise", label: "Exercising your rights" },
  { id: "contact", label: "Contact & complaints" },
  { id: "changes", label: "Changes to this notice" },
] as const;

function SectionTitle({
  id,
  n,
  children,
}: {
  id: string;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <Title
      id={id}
      order={2}
      fz={{ base: "lg", sm: "xl" }}
      c="#2f5d2b"
      mt="xl"
      style={{ scrollMarginTop: 24 }}
    >
      {n}. {children}
    </Title>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" c="#3a3f4a" style={{ lineHeight: 1.65 }}>
      {children}
    </Text>
  );
}

export default function PrivacyNoticeContent() {
  return (
    <Stack gap="xs">
      <Title order={1} fz={{ base: "h2", sm: "h1" }} c="#2f5d2b">
        Privacy Notice
      </Title>
      <Text size="sm" c="#808898">
        Version {PRIVACY_NOTICE_VERSION} · Effective {PRIVACY_NOTICE_EFFECTIVE_DATE}
      </Text>
      <Text size="sm" c="#808898">
        Issued in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173, the
        &ldquo;DPA&rdquo;), its Implementing Rules and Regulations (IRR), and applicable issuances
        of the National Privacy Commission (NPC).
      </Text>

      <Body>
        This Privacy Notice (the &ldquo;Notice&rdquo;) explains how{" "}
        <strong>{DPO_CONTACT.organization}</strong> (the &ldquo;School&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) collects, uses, discloses, stores, protects, retains, and disposes of
        personal data in connection with <strong>ClassCloud</strong>, a cloud-based academic records
        and periodical-test reporting system used by the School. It also describes the rights
        available to you as a data subject and how to exercise them.
      </Body>

      {/* Contents */}
      <Paper withBorder radius="md" p="md" mt="sm" bg="#f7fbf6" style={{ borderColor: "#d3e9d0" }}>
        <Text size="sm" fw={600} c="#2f5d2b" mb={6}>
          Contents
        </Text>
        <List size="sm" spacing={2} c="#3a3f4a" type="ordered">
          {SECTIONS.map((s) => (
            <ListItem key={s.id}>
              <Anchor href={`#${s.id}`} c="#4EAE4A" underline="hover">
                {s.label}
              </Anchor>
            </ListItem>
          ))}
        </List>
      </Paper>

      {/* 1. Who we are */}
      <SectionTitle id={SECTIONS[0].id} n={1}>
        Who we are
      </SectionTitle>
      <Body>
        The School is the <strong>Personal Information Controller (PIC)</strong> responsible for the
        personal data processed through ClassCloud, within the meaning of <strong>Section 3(h)</strong>{" "}
        of the DPA. ClassCloud is operated on the School&apos;s behalf as a{" "}
        <strong>Personal Information Processor (PIP)</strong> under <strong>Section 3(i)</strong>, and
        engages the sub-processors listed in Section 8 below. This Notice is published at a public
        address that does not require sign-in and is presented before or at the point of data
        collection, in keeping with your right to be informed under <strong>Section 16</strong> of the
        DPA.
      </Body>

      {/* 2. Key terms */}
      <SectionTitle id={SECTIONS[1].id} n={2}>
        Key terms
      </SectionTitle>
      <Body>
        The following terms, drawn from Section 3 of the DPA, are used throughout this Notice:
      </Body>
      <Table mt={4} striped withTableBorder withColumnBorders fz="sm" verticalSpacing="xs">
        <TableThead>
          <TableTr>
            <TableTh w={{ base: 140, sm: 220 }}>Term</TableTh>
            <TableTh>Meaning</TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>
          {KEY_DEFINITIONS.map((d) => (
            <TableTr key={d.term}>
              <TableTd>
                <Text size="sm" fw={600} c="#3a3f4a">
                  {d.term}
                </Text>
                <Text size="xs" c="#808898">
                  {d.basis}
                </Text>
              </TableTd>
              <TableTd>
                <Text size="sm" c="#3a3f4a">
                  {d.meaning}
                </Text>
              </TableTd>
            </TableTr>
          ))}
        </TableTbody>
      </Table>

      {/* 3. Personal data we collect */}
      <SectionTitle id={SECTIONS[2].id} n={3}>
        Personal data we collect
      </SectionTitle>
      <Body>
        Guided by the <strong>proportionality</strong> principle in <strong>Section 11</strong> of the
        DPA, we practice <strong>data minimization</strong> and process only the personal data that is
        adequate, relevant, and not excessive:
      </Body>
      <Table mt={4} striped withTableBorder withColumnBorders fz="sm" verticalSpacing="xs">
        <TableThead>
          <TableTr>
            <TableTh w={{ base: 120, sm: 160 }}>Data subject</TableTh>
            <TableTh>Personal data</TableTh>
            <TableTh w={{ base: 140, sm: 220 }}>Source</TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>
          {DATA_CATEGORIES.map((c) => (
            <TableTr key={c.subject}>
              <TableTd>
                <Text size="sm" fw={600} c="#3a3f4a">
                  {c.subject}
                </Text>
              </TableTd>
              <TableTd>
                <Text size="sm" c="#3a3f4a">
                  {c.data}
                </Text>
              </TableTd>
              <TableTd>
                <Text size="sm" c="#3a3f4a">
                  {c.source}
                </Text>
              </TableTd>
            </TableTr>
          ))}
        </TableTbody>
      </Table>
      <Body>
        For learners, ClassCloud deliberately processes only a <strong>subset</strong> of the
        official School Form 1 (SF1 — School Register). We do <em>not</em> {""}collect a
        learner&apos;s home address, parents&apos; or guardians&apos; names, religion, or any health
        or disability information, even though those fields appear on the SF1.
      </Body>

      {/* 4. Sensitive personal information */}
      <SectionTitle id={SECTIONS[3].id} n={4}>
        Sensitive personal information
      </SectionTitle>
      <Body>
        ClassCloud is designed to <strong>minimize</strong> its handling of sensitive personal
        information. We deliberately do <strong>not</strong> collect the categories under{" "}
        <strong>Section 3(l)</strong> of the DPA that relate to an individual&apos;s race, ethnic
        origin, color, marital status, age, religious, philosophical or political affiliations,
        health, genetic or sexual life, or any proceeding for an offense.
      </Body>
      <Body>
        We do, however, process two categories of personal data that <strong>are</strong> sensitive
        personal information within the meaning of Section 3(l):
      </Body>
      <List size="sm" spacing={4} c="#3a3f4a">
        <ListItem>
          <strong>Periodical assessment scores</strong>, which are &ldquo;education&rdquo; data under{" "}
          <strong>Section 3(l)(2)</strong>; and
        </ListItem>
        <ListItem>
          the <strong>Learner Reference Number (LRN)</strong>, an identifier &ldquo;issued by
          government agencies peculiar to an individual&rdquo; — assigned by the Department of
          Education to each learner — under <strong>Section 3(l)(3)</strong>.
        </ListItem>
      </List>
      <Body>
        The School processes this sensitive personal information under <strong>Section 13(b)</strong>{" "}
        of the DPA — processing provided for by existing laws and regulations, namely the School&apos;s
        record-keeping and reporting obligations as a public school under DepEd issuances — and applies
        the security safeguards described in Section 20. We do not process this data for any purpose
        beyond those declared in this Notice.
      </Body>

      {/* 5. Purposes */}
      <SectionTitle id={SECTIONS[4].id} n={5}>
        Purposes of processing
      </SectionTitle>
      <Body>
        We process personal data only for the following specified and legitimate purposes:
      </Body>
      <List size="sm" spacing={4} c="#3a3f4a">
        {PROCESSING_PURPOSES.map((p) => (
          <ListItem key={p}>{p}</ListItem>
        ))}
      </List>
      <Body>
        We do not process personal data for any purpose incompatible with those above, and we do not
        use learner or staff data for advertising or for sale to third parties.
      </Body>

      {/* 6. Lawful basis */}
      <SectionTitle id={SECTIONS[5].id} n={6}>
        Lawful basis for processing
      </SectionTitle>
      <Body>
        All processing observes the three general data privacy principles of{" "}
        <strong>Section 11</strong> of the DPA — <strong>transparency</strong>,{" "}
        <strong>legitimate purpose</strong>, and <strong>proportionality</strong>. We rely on the
        following criteria for lawful processing under <strong>Section 12</strong> of the DPA:
      </Body>
      <List size="sm" spacing={4} c="#3a3f4a">
        <ListItem>
          <strong>Consent — Sec. 12(a).</strong> Staff and faculty give explicit, recorded consent to
          this Notice when they self-register or accept an invitation for an account.
        </ListItem>
        <ListItem>
          <strong>Fulfillment of a public mandate — Sec. 12(e).</strong> Processing of learner data
          is necessary for the School to carry out its educational mandate as a public school and its
          functions in relation to the Department of Education.
        </ListItem>
        <ListItem>
          <strong>Compliance with a legal obligation — Sec. 12(c).</strong> Certain records are
          processed to meet the School&apos;s record-keeping and reporting obligations under law and
          DepEd issuances.
        </ListItem>
      </List>
      <Body>
        Because we process the <strong>sensitive personal information</strong> described in Section 4,
        we additionally rely on <strong>Section 13(b)</strong> of the DPA — processing provided for by
        existing laws and regulations — as the basis for that processing.
      </Body>

      {/* 7. Minors */}
      <SectionTitle id={SECTIONS[6].id} n={7}>
        Learners and minors
      </SectionTitle>
      <Body>
        Learners do <strong>not</strong> {""}hold ClassCloud accounts and do {""} not log in. A
        learner&apos;s personal data is entered and managed only by authorized school staff, drawn
        from records the School already holds. Consent for the processing of a learner&apos;s personal
        data is obtained by the School from the learner&apos;s parent or guardian through its
        enrolment process, consistent with the School&apos;s mandate under Section 12(e) of the DPA.
      </Body>

      {/* 8. Disclosure & sub-processors */}
      <SectionTitle id={SECTIONS[7].id} n={8}>
        Disclosure, sub-processors &amp; cross-border transfer
      </SectionTitle>
      <Body>
        We do <strong>not</strong> sell personal data. As permitted by <strong>Section 14</strong> of
        the DPA, the School subcontracts the processing of personal data to ClassCloud and engages the
        following sub-processors (PIPs) to operate it. Under the{" "}
        <strong>principle of accountability</strong> in <strong>Section 21</strong> of the DPA, the
        School remains responsible for personal data transferred to these processors and uses
        contractual and other reasonable means to ensure a comparable level of protection.
      </Body>
      <Table mt={4} striped withTableBorder withColumnBorders fz="sm" verticalSpacing="xs">
        <TableThead>
          <TableTr>
            <TableTh>Provider</TableTh>
            <TableTh>Purpose</TableTh>
            <TableTh>Processing location</TableTh>
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
      <Body>
        Because these providers may store or process data{" "}
        <strong>outside the Philippines</strong>, such transfers are treated as{" "}
        <strong>cross-border transfers</strong>. They are carried out under appropriate safeguards,
        including the providers&apos; data-processing agreements and recognized international security
        and privacy certifications. We may also disclose personal data where required to do so by law
        or by a lawful order of a court or government authority.
      </Body>

      {/* 9. Retention */}
      <SectionTitle id={SECTIONS[8].id} n={9}>
        Retention &amp; disposal
      </SectionTitle>
      <Body>
        In line with <strong>Section 11(e)</strong> of the DPA, personal data is retained only for as
        long as necessary for the purposes for which it was collected, or as required by law:
      </Body>
      <Table mt={4} striped withTableBorder withColumnBorders fz="sm" verticalSpacing="xs">
        <TableThead>
          <TableTr>
            <TableTh w={{ base: 150, sm: 220 }}>Record type</TableTh>
            <TableTh w={{ base: 110, sm: 150 }}>Retention period</TableTh>
            <TableTh>Basis</TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>
          {RETENTION_SCHEDULE.map((r) => (
            <TableTr key={r.record}>
              <TableTd>{r.record}</TableTd>
              <TableTd>{r.period}</TableTd>
              <TableTd>{r.basis}</TableTd>
            </TableTr>
          ))}
        </TableTbody>
      </Table>
      <Body>
        On expiry of the applicable period, personal data is securely deleted or anonymized so that it
        can no longer be associated with a data subject.
      </Body>

      {/* 10. Security */}
      <SectionTitle id={SECTIONS[9].id} n={10}>
        How we secure your data
      </SectionTitle>
      <Body>
        In accordance with <strong>Section 20</strong> of the DPA, we implement reasonable and
        appropriate organizational, physical, and technical measures to protect personal data against
        accidental or unlawful destruction, alteration, disclosure, and any other unlawful processing:
      </Body>
      <List size="sm" spacing={4} c="#3a3f4a">
        <ListItem>
          Encryption of personal data in transit (HTTPS/TLS) and at rest at the database layer.
        </ListItem>
        <ListItem>
          Role-based access control enforced down to the database, including an &ldquo;active staff
          only&rdquo; read guard, so staff see only the records within their assigned scope
          (need-to-know).
        </ListItem>
        <ListItem>
          Append-only audit logging of security and academic actions for accountability.
        </ListItem>
        <ListItem>Rate limiting and bot/abuse protection on authentication endpoints.</ListItem>
        <ListItem>
          Mandatory password resets for administrator-created accounts on first login, and
          password-strength requirements at registration.
        </ListItem>
      </List>

      {/* 11. Breach notification */}
      <SectionTitle id={SECTIONS[10].id} n={11}>
        Personal data breach notification
      </SectionTitle>
      <Body>
        We maintain measures to detect and respond to personal data breaches. Where a breach involving
        sensitive personal information or information that may enable identity fraud is reasonably
        believed to have occurred, and is likely to give rise to a real risk of serious harm, the
        School — as PIC — has a duty to promptly notify the National Privacy Commission and the
        affected data subjects under <strong>Section 20(f)</strong> of the DPA. The notification
        window is set at <strong>seventy-two (72) hours</strong> from knowledge of the breach by the
        IRR (<strong>Rule IX, Section 38</strong>) and{" "}
        <strong>NPC Circular No. 16-03</strong> (Personal Data Breach Management), which the School
        observes.
      </Body>

      {/* 12. Cookies & analytics */}
      <SectionTitle id={SECTIONS[11].id} n={12}>
        Cookies &amp; analytics
      </SectionTitle>
      <Body>
        ClassCloud uses only <strong>strictly necessary cookies</strong> to keep you signed in and to
        secure your session; these are essential to the service and cannot be switched off. We use
        privacy-friendly, aggregate web analytics to understand overall usage and improve reliability.
        We do <strong>not</strong> use advertising cookies or engage in cross-site tracking.
      </Body>

      {/* 13. Automated decision-making */}
      <SectionTitle id={SECTIONS[12].id} n={13}>
        Automated decision-making &amp; profiling
      </SectionTitle>
      <Body>
        ClassCloud computes scores, reports, and item analysis as tools for teachers and
        administrators. It does <strong>not</strong> subject any data subject to a decision based{" "}
        <strong>solely</strong> on automated processing that produces legal effects or similarly
        significant effects on the individual. All academic and administrative decisions remain with
        authorized school personnel.
      </Body>

      {/* 14. Your rights */}
      <SectionTitle id={SECTIONS[13].id} n={14}>
        Your rights as a data subject
      </SectionTitle>
      <Body>
        The DPA grants you the following rights over your personal data (Sections 16 and 18, and the
        IRR):
      </Body>
      <Table mt={4} striped withTableBorder withColumnBorders fz="sm" verticalSpacing="xs">
        <TableThead>
          <TableTr>
            <TableTh w={{ base: 150, sm: 220 }}>Right</TableTh>
            <TableTh>What it means</TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>
          {DATA_SUBJECT_RIGHTS.map((r) => (
            <TableTr key={r.right}>
              <TableTd>
                <Text size="sm" fw={600} c="#3a3f4a">
                  {r.right}
                </Text>
                <Text size="xs" c="#808898">
                  {r.basis}
                </Text>
              </TableTd>
              <TableTd>
                <Text size="sm" c="#3a3f4a">
                  {r.description}
                </Text>
              </TableTd>
            </TableTr>
          ))}
        </TableTbody>
      </Table>

      {/* 15. Exercising your rights */}
      <SectionTitle id={SECTIONS[14].id} n={15}>
        How to exercise your rights
      </SectionTitle>
      <Body>
        To exercise any of the rights above, send a written request to the Data Protection Officer
        using the contact details in Section 16. We may ask you to verify your identity before acting
        on a request, and we will respond within a reasonable period. Because the School has legal
        record-keeping obligations as a public school, requests to erase or block student or academic
        records are administered by the School and may be subject to its records-retention schedule.
        Account deletion bans the underlying credentials so the account cannot be reused.
      </Body>

      {/* 16. Contact & complaints */}
      <SectionTitle id={SECTIONS[15].id} n={16}>
        Contact &amp; complaints
      </SectionTitle>
      <Body>
        For questions about this Notice or to exercise your rights, contact our Data Protection
        Officer:
      </Body>
      <Body>
        <strong>{DPO_CONTACT.role}</strong>, {DPO_CONTACT.organization} —{" "}
        <Anchor href={`mailto:${DPO_CONTACT.email}`} c="#4EAE4A">
          {DPO_CONTACT.email}
        </Anchor>
      </Body>
      <Body>
        If you believe your rights under the DPA have been violated, you also have the right to lodge
        a complaint with the <strong>National Privacy Commission</strong> in accordance with its Rules
        of Procedure (NPC Circular No. 2021-01). Visit{" "}
        <Anchor href="https://privacy.gov.ph" target="_blank" rel="noopener noreferrer" c="#4EAE4A">
          privacy.gov.ph
        </Anchor>{" "}
        for guidance and contact details.
      </Body>

      {/* 17. Changes */}
      <SectionTitle id={SECTIONS[16].id} n={17}>
        Changes to this notice
      </SectionTitle>
      <Body>
        We may update this Notice from time to time to reflect changes in our practices or in
        applicable law. The current version and effective date are shown at the top of this page.
        Where changes are material, we will update the version identifier (currently{" "}
        <strong>{PRIVACY_NOTICE_VERSION}</strong>) and may ask you to acknowledge the updated Notice.
        Your consent at registration is recorded together with the version of the Notice in force at
        that time.
      </Body>
    </Stack>
  );
}
