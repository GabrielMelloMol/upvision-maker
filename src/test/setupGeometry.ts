import { configure } from "@testing-library/react";

// #127: nas ferramentas 3D a prévia leva segundos para gerar; com a máquina carregada, o findBy/waitFor padrão (1 s)
// desistia antes. Só no projeto "geometria" do Vitest.
configure({ asyncUtilTimeout: 15_000 });
