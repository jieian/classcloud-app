"use client";

import { Box, Text, TextInput, Textarea } from "@mantine/core";
import type { UseFormReturnType } from "@mantine/form";
import type { CreateCurriculumForm } from "../_lib/types";

interface Props {
  form: UseFormReturnType<CreateCurriculumForm>;
}

export default function StepCurriculumNameDesc({ form }: Props) {
  return (
    <Box>
      <Text size="lg" fw={700} mb="md" c="#4EAE4A">
        Specify Name and Description
      </Text>

      <Box p="lg" style={{ border: "1px solid #e0e0e0", borderRadius: "8px" }}>
        <Text size="md" fw={700} mb="md" c="#4EAE4A">
          Name and Description
        </Text>

        <TextInput
          label="Name"
          placeholder="e.g. K-12 Enhanced Basic Education"
          required
          mb="md"
          maxLength={50}
          description={`${form.values.name.length}/50 characters`}
          {...form.getInputProps("name")}
        />

        <Textarea
          label="Description"
          placeholder="Briefly describe the purpose and scope of this curriculum"
          required
          autosize
          minRows={4}
          maxLength={500}
          description={`${form.values.description.length}/500 characters`}
          {...form.getInputProps("description")}
        />
      </Box>
    </Box>
  );
}
